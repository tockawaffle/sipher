/**
 * Discover route integration test.
 *
 * Exercises `/discover` (`GET`, `POST REGISTER`, `POST DISCOVER`) on Server A
 * using Server C from the federation cluster as the real remote peer — there
 * is no stub layer. Every `federationFetch` the route makes against the peer
 * lands on an actual sipher-c instance with real signing/encryption keys.
 *
 * Run inside the Docker test cluster:
 *
 *   docker compose -f tests/docker-compose.yml run --rm test-runner \
 *     tests/integration/discover.ts --peer http://sipher-c:3002
 *
 * `--peer` defaults to `http://sipher-c:3002` if omitted.
 *
 * Coverage parity with the previous (deleted) `tests/federation/discover.e2e.ts`:
 *   1. GET /discover returns own keys and only healthy peers ordered by lastSeen desc.
 *   2. POST /discover rejects invalid JSON.
 *   3. POST /discover rejects unknown method.
 *   4. REGISTER rejects malformed signing-key length.
 *   5. REGISTER rejects SSRF URL.
 *   6. REGISTER returns 502 when peer is unreachable.
 *   7. REGISTER rejects key mismatch vs remote GET /discover.
 *   8. REGISTER rejects when URL already registered with different keys.
 *   9. REGISTER happy path upserts the peer into the registry.
 *   10. DISCOVER returns 404 when signing public key is unknown.
 *   11. DISCOVER rejects blocked stored URL with 400.
 *   12. DISCOVER returns 502 when stored peer is unreachable.
 *   13. DISCOVER rejects invalid envelope (undecryptable ciphertext).
 *   14. DISCOVER rejects fingerprint mismatch inside decrypted envelope.
 *   15. DISCOVER rejects malformed envelope shape.
 *   16. DISCOVER happy path confirms keys against the live peer.
 *
 * Whatever the test does to A's `server_registry`, it restores at the end so
 * that subsequent integration tests inherit a working mesh.
 */

import db from "@/lib/db";
import { serverRegistry } from "@/lib/db/schema";
import { encryptPayload, fingerprintKey } from "@/lib/federation/keytools";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Required env (test-runner uses sipher-a.env)
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
	"FEDERATION_PUBLIC_KEY",
	"FEDERATION_PRIVATE_KEY",
	"FEDERATION_ENCRYPTION_PUBLIC_KEY",
	"FEDERATION_ENCRYPTION_PRIVATE_KEY",
	"BETTER_AUTH_URL",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
	console.error("Missing required environment variables:");
	missing.forEach((k) => console.error(`  - ${k}`));
	console.error("Run inside the docker test cluster (env_file: tests/docker/sipher-a.env).");
	process.exit(1);
}

const ORIGIN = process.env.BETTER_AUTH_URL!;
const OWN_SIGNING_PUB = process.env.FEDERATION_PUBLIC_KEY!;
const OWN_ENCRYPTION_PUB = process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!;

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function argAfter(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const peerUrl = argAfter("--peer") ?? "http://sipher-c:3002";

console.log("Discover route test");
console.log(`  Server A (us):  ${ORIGIN}`);
console.log(`  Peer (real):    ${peerUrl}`);
console.log(`  A signing key:  ${fingerprintKey(OWN_SIGNING_PUB).slice(0, 16)}…`);

// ---------------------------------------------------------------------------
// Test harness (matches proxy-chain.ts so output is consistent across the suite)
// ---------------------------------------------------------------------------

interface TestResult {
	name: string;
	passed: boolean;
	message: string;
}

const results: TestResult[] = [];

function pass(name: string, message = "OK") {
	console.log(`  ✔ ${name}`);
	if (message !== "OK") console.log(`    ${message}`);
	results.push({ name, passed: true, message });
}

function fail(name: string, message: string) {
	console.error(`  ✘ ${name}`);
	console.error(`    ${message}`);
	results.push({ name, passed: false, message });
}

async function readErrorBody(response: Response): Promise<string> {
	try {
		const body = await response.json();
		return body?.error ?? body?.message ?? JSON.stringify(body);
	} catch {
		try {
			return await response.text();
		} catch {
			return response.statusText;
		}
	}
}

function randomKeyPair() {
	// Anonymous helper — we deliberately use signed bytes of any size for
	// "wrong key" tests so we don't accidentally rely on libsodium primitives
	// matching the validity rules under test.
	const bytes = (len: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(len)));
	return {
		signingPublicKey: bytes(32).toString("base64"),
		encryptionPublicKey: bytes(32).toString("base64"),
	};
}

async function postDiscover(body: unknown, contentType = "application/json") {
	return fetch(`${ORIGIN}/discover`, {
		method: "POST",
		headers: {
			"Content-Type": contentType,
			"X-Federation-Origin": ORIGIN,
			"Origin": ORIGIN,
		},
		body: typeof body === "string" ? body : JSON.stringify(body),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
}

function ownEncryptionPublicKeyBytes(): Uint8Array {
	return new Uint8Array(Buffer.from(OWN_ENCRYPTION_PUB, "base64"));
}

function buildDiscoverEnvelope(url: string, signingPub: string, encPub: string) {
	const plaintext = JSON.stringify({
		url,
		publicKeyFingerprint: fingerprintKey(signingPub),
		encryptionPublicKeyFingerprint: fingerprintKey(encPub),
	});
	return encryptPayload(plaintext, ownEncryptionPublicKeyBytes());
}

// ---------------------------------------------------------------------------
// Discover the live peer's keys once (sipher-c will return them via GET /discover)
// and capture A's pre-existing mesh entries so we can restore them at the end.
// ---------------------------------------------------------------------------

console.log("\n── Snapshotting cluster state ───────────────────────────");

interface PeerKeys {
	publicKey: string;
	encryptionPublicKey: string;
}

async function fetchPeerKeys(url: string): Promise<PeerKeys> {
	const res = await fetch(`${url}/discover`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!res.ok) {
		throw new Error(`GET ${url}/discover returned ${res.status}`);
	}
	const body = await res.json();
	return { publicKey: body.publicKey, encryptionPublicKey: body.encryptionPublicKey };
}

const peerKeys = await fetchPeerKeys(peerUrl);
console.log(`  Peer signing key:    ${fingerprintKey(peerKeys.publicKey).slice(0, 16)}…`);
console.log(`  Peer encryption key: ${fingerprintKey(peerKeys.encryptionPublicKey).slice(0, 16)}…`);

const meshSnapshot = await db.select().from(serverRegistry);
console.log(`  Snapshotted ${meshSnapshot.length} existing registry entries.`);

async function restoreMesh() {
	// Wipe everything, then re-insert the snapshot. Idempotent and safe to
	// call even after partial failures inside individual tests.
	await db.delete(serverRegistry);
	for (const row of meshSnapshot) {
		await db.insert(serverRegistry).values(row).onConflictDoNothing();
	}
}

// ---------------------------------------------------------------------------
// 1. GET /discover returns own keys and only healthy peers, ordered by lastSeen desc
// ---------------------------------------------------------------------------

console.log("\n── Test: GET /discover ──────────────────────────────────");

{
	const testName = "GET /discover orders healthy peers by lastSeen desc";
	const newer = "http://discover-test-peer-newer.invalid";
	const older = "http://discover-test-peer-older.invalid";
	try {
		await db.delete(serverRegistry).where(eq(serverRegistry.url, newer));
		await db.delete(serverRegistry).where(eq(serverRegistry.url, older));

		const k1 = randomKeyPair();
		const k2 = randomKeyPair();
		await db.insert(serverRegistry).values({
			id: crypto.randomUUID(),
			url: newer,
			publicKey: k1.signingPublicKey,
			encryptionPublicKey: k1.encryptionPublicKey,
			isHealthy: true,
			lastSeen: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await db.insert(serverRegistry).values({
			id: crypto.randomUUID(),
			url: older,
			publicKey: k2.signingPublicKey,
			encryptionPublicKey: k2.encryptionPublicKey,
			isHealthy: true,
			lastSeen: new Date(Date.now() - 120_000),
			createdAt: new Date(Date.now() - 120_000),
			updatedAt: new Date(Date.now() - 120_000),
		});

		const res = await fetch(`${ORIGIN}/discover`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) {
			fail(testName, `GET /discover returned ${res.status}`);
		} else {
			const body = await res.json();
			const peerUrls = body.peers.map((p: { url: string }) => p.url);
			const newerIdx = peerUrls.indexOf(newer);
			const olderIdx = peerUrls.indexOf(older);
			if (body.url !== ORIGIN) {
				fail(testName, `expected url=${ORIGIN}, got ${body.url}`);
			} else if (body.publicKey !== OWN_SIGNING_PUB) {
				fail(testName, "GET /discover did not echo own signing key");
			} else if (newerIdx === -1 || olderIdx === -1) {
				fail(testName, `seeded peers missing from response (newer=${newerIdx}, older=${olderIdx})`);
			} else if (newerIdx > olderIdx) {
				fail(testName, `newer peer (idx ${newerIdx}) should come before older (idx ${olderIdx})`);
			} else {
				// Health filter: mark older unhealthy and re-check.
				await db.update(serverRegistry).set({ isHealthy: false }).where(eq(serverRegistry.url, older));
				const res2 = await fetch(`${ORIGIN}/discover`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
				const body2 = await res2.json();
				const peerUrls2 = body2.peers.map((p: { url: string }) => p.url);
				if (peerUrls2.includes(older)) {
					fail(testName, "unhealthy peer should be filtered out but still appears");
				} else if (!peerUrls2.includes(newer)) {
					fail(testName, "healthy peer disappeared after toggling sibling unhealthy");
				} else {
					pass(testName, `${peerUrls.length} peers seen; ordering & healthy filter OK`);
				}
			}
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	} finally {
		await db.delete(serverRegistry).where(eq(serverRegistry.url, newer));
		await db.delete(serverRegistry).where(eq(serverRegistry.url, older));
	}
}

// ---------------------------------------------------------------------------
// 2-3. POST /discover input validation
// ---------------------------------------------------------------------------

console.log("\n── Test: POST /discover input validation ────────────────");

{
	const testName = "rejects invalid JSON";
	try {
		const res = await postDiscover("{not-json");
		const body = await res.json();
		if (res.status === 400 && body.code === "INVALID_JSON") {
			pass(testName);
		} else {
			fail(testName, `expected 400/INVALID_JSON, got ${res.status}/${body.code}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "rejects unknown method";
	try {
		const res = await postDiscover({ method: "NOT_A_REAL_METHOD" });
		if (res.status === 400) {
			pass(testName, await readErrorBody(res));
		} else {
			fail(testName, `expected 400, got ${res.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 4-9. REGISTER scenarios
// ---------------------------------------------------------------------------

console.log("\n── Test: REGISTER ───────────────────────────────────────");

{
	const testName = "REGISTER rejects malformed signing-key length";
	try {
		const res = await postDiscover({
			method: "REGISTER",
			url: peerUrl,
			publicKey: Buffer.alloc(31).toString("base64"),
			encryptionPublicKey: peerKeys.encryptionPublicKey,
		});
		if (res.status === 400) {
			pass(testName);
		} else {
			fail(testName, `expected 400, got ${res.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "REGISTER rejects SSRF URL";
	try {
		const k = randomKeyPair();
		const res = await postDiscover({
			method: "REGISTER",
			url: "http://10.0.0.1/",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
		});
		if (res.status === 400) {
			pass(testName);
		} else {
			fail(testName, `expected 400, got ${res.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "REGISTER returns 502 when peer is unreachable";
	try {
		const k = randomKeyPair();
		// sipher-unreachable.test is allow-listed in DEV_ALLOWED_HOSTNAMES but
		// fails DNS — the same trick the proxy-chain failover test uses.
		const res = await postDiscover({
			method: "REGISTER",
			url: "http://sipher-unreachable.test:9999/",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
		});
		const body = await res.json();
		if (res.status === 502) {
			pass(testName, `code=${body.code}`);
		} else {
			fail(testName, `expected 502, got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "REGISTER rejects key mismatch vs remote GET /discover";
	try {
		const wrong = randomKeyPair();
		const res = await postDiscover({
			method: "REGISTER",
			url: peerUrl,
			publicKey: wrong.signingPublicKey,
			encryptionPublicKey: wrong.encryptionPublicKey,
		});
		const body = await res.json();
		if (res.status === 400 && /Public keys do not match/i.test(body.error)) {
			pass(testName, body.error);
		} else {
			fail(testName, `expected 400 with "Public keys do not match", got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "REGISTER rejects URL already registered with different keys";
	try {
		// Pre-state: replace A's registry entry for the peer with wrong keys
		// so the route's "existing registration with mismatched key" branch
		// fires. We restore the correct entry from the mesh snapshot at the
		// end of the file.
		const wrong = randomKeyPair();
		await db
			.update(serverRegistry)
			.set({ publicKey: wrong.signingPublicKey, encryptionPublicKey: wrong.encryptionPublicKey })
			.where(eq(serverRegistry.url, peerUrl));

		const res = await postDiscover({
			method: "REGISTER",
			url: peerUrl,
			publicKey: peerKeys.publicKey,
			encryptionPublicKey: peerKeys.encryptionPublicKey,
		});
		const body = await res.json();
		if (res.status === 400 && /key rotation flow/i.test(body.error)) {
			pass(testName, body.error);
		} else {
			fail(testName, `expected 400 mentioning "key rotation flow", got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	} finally {
		// Restore the correct entry before the next test relies on it.
		await db
			.update(serverRegistry)
			.set({ publicKey: peerKeys.publicKey, encryptionPublicKey: peerKeys.encryptionPublicKey })
			.where(eq(serverRegistry.url, peerUrl));
	}
}

{
	const testName = "REGISTER happy path upserts the peer into the registry";
	try {
		// Drop A's entry for the peer first so we genuinely exercise the
		// insert path (the route upserts, but seeing an unchanged row would
		// be unconvincing). The mesh snapshot will restore it at the end.
		await db.delete(serverRegistry).where(eq(serverRegistry.url, peerUrl));

		const res = await postDiscover({
			method: "REGISTER",
			url: peerUrl,
			publicKey: peerKeys.publicKey,
			encryptionPublicKey: peerKeys.encryptionPublicKey,
		});
		const body = await res.json();
		if (res.status !== 200) {
			fail(testName, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
		} else {
			const row = (await db.select().from(serverRegistry).where(eq(serverRegistry.url, peerUrl)))[0];
			if (!row) {
				fail(testName, "registry row missing after REGISTER 200");
			} else if (row.publicKey !== peerKeys.publicKey) {
				fail(testName, "registry signing key mismatch after REGISTER");
			} else if (row.encryptionPublicKey !== peerKeys.encryptionPublicKey) {
				fail(testName, "registry encryption key mismatch after REGISTER");
			} else if (body.echo?.publicKey !== OWN_SIGNING_PUB) {
				fail(testName, "REGISTER response did not echo own signing key");
			} else {
				pass(testName, `peer ${peerUrl} registered with real keys from live GET /discover`);
			}
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 10-16. DISCOVER scenarios
// ---------------------------------------------------------------------------

console.log("\n── Test: DISCOVER ───────────────────────────────────────");

{
	const testName = "DISCOVER returns 404 when signing public key is unknown";
	try {
		const k = randomKeyPair();
		const envelope = buildDiscoverEnvelope("http://unused.invalid", k.signingPublicKey, k.encryptionPublicKey);
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			envelope,
		});
		if (res.status === 404) {
			pass(testName);
		} else {
			fail(testName, `expected 404, got ${res.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "DISCOVER rejects blocked stored URL with 400";
	const blockedUrl = "http://10.0.0.2:999/";
	const k = randomKeyPair();
	try {
		await db.insert(serverRegistry).values({
			id: crypto.randomUUID(),
			url: blockedUrl,
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			isHealthy: true,
			lastSeen: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const envelope = buildDiscoverEnvelope(blockedUrl, k.signingPublicKey, k.encryptionPublicKey);
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			envelope,
		});
		const body = await res.json();
		if (res.status === 400 && /stored server URL is blocked/i.test(body.error)) {
			pass(testName, body.error);
		} else {
			fail(testName, `expected 400 "blocked", got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	} finally {
		await db.delete(serverRegistry).where(eq(serverRegistry.url, blockedUrl));
	}
}

{
	const testName = "DISCOVER returns 502 when stored peer is unreachable";
	const deadUrl = "http://sipher-unreachable.test:9999/";
	const k = randomKeyPair();
	try {
		await db.insert(serverRegistry).values({
			id: crypto.randomUUID(),
			url: deadUrl,
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			isHealthy: true,
			lastSeen: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		const envelope = buildDiscoverEnvelope(deadUrl, k.signingPublicKey, k.encryptionPublicKey);
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			envelope,
		});
		const body = await res.json();
		if (res.status === 502) {
			pass(testName, `code=${body.code}`);
		} else {
			fail(testName, `expected 502, got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	} finally {
		await db.delete(serverRegistry).where(eq(serverRegistry.url, deadUrl));
	}
}

{
	const testName = "DISCOVER rejects invalid envelope (undecryptable ciphertext)";
	try {
		// The peer entry for the real cluster peer is already in registry, but
		// the envelope check happens during zod validation BEFORE any peer fetch,
		// so the test never depends on the peer being reachable.
		const goodEnvelope = buildDiscoverEnvelope(peerUrl, peerKeys.publicKey, peerKeys.encryptionPublicKey);
		const broken = {
			...goodEnvelope,
			ciphertext: Buffer.alloc(Buffer.from(goodEnvelope.ciphertext, "base64").length, 0).toString("base64"),
		};
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: peerKeys.publicKey,
			encryptionPublicKey: peerKeys.encryptionPublicKey,
			envelope: broken,
		});
		const body = await res.json();
		if (res.status === 400 && /Invalid envelope/i.test(body.error)) {
			pass(testName, body.error);
		} else {
			fail(testName, `expected 400 "Invalid envelope", got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "DISCOVER rejects fingerprint mismatch inside decrypted envelope";
	try {
		const plaintext = JSON.stringify({
			url: peerUrl,
			publicKeyFingerprint: "deadbeef",
			encryptionPublicKeyFingerprint: fingerprintKey(peerKeys.encryptionPublicKey),
		});
		const envelope = encryptPayload(plaintext, ownEncryptionPublicKeyBytes());
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: peerKeys.publicKey,
			encryptionPublicKey: peerKeys.encryptionPublicKey,
			envelope,
		});
		const body = await res.json();
		if (res.status === 400 && /signing public key/i.test(body.error)) {
			pass(testName, body.error);
		} else {
			fail(testName, `expected 400 mentioning signing public key, got ${res.status}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "DISCOVER rejects malformed envelope shape";
	try {
		const k = randomKeyPair();
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: k.signingPublicKey,
			encryptionPublicKey: k.encryptionPublicKey,
			envelope: { ephemeralPublicKey: "AA", iv: "AA", ciphertext: "AA" /* missing authTag */ },
		});
		if (res.status === 400) {
			pass(testName);
		} else {
			fail(testName, `expected 400, got ${res.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

{
	const testName = "DISCOVER happy path confirms keys against the live peer";
	try {
		const envelope = buildDiscoverEnvelope(peerUrl, peerKeys.publicKey, peerKeys.encryptionPublicKey);
		const res = await postDiscover({
			method: "DISCOVER",
			publicKey: peerKeys.publicKey,
			encryptionPublicKey: peerKeys.encryptionPublicKey,
			envelope,
		});
		const body = await res.json();
		if (res.status !== 200) {
			fail(testName, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
		} else if (body.sameKeyOnServer !== true || body.sameKeyOnFetch !== true) {
			fail(testName, `expected both confirmations true, got ${JSON.stringify(body)}`);
		} else {
			pass(testName, "live peer GET /discover confirmed local registry keys");
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// Restore cluster mesh state and report
// ---------------------------------------------------------------------------

await restoreMesh();
console.log("\n  Restored original mesh snapshot.");

const passed = results.filter((r) => r.passed);
const failed = results.filter((r) => !r.passed);

console.log("\n════════════════════════════════════════════════════════");
console.log(`Results: ${passed.length} passed, ${failed.length} failed out of ${results.length}`);

if (failed.length > 0) {
	console.error("\nFailed tests:");
	failed.forEach((f) => console.error(`  ✘ ${f.name}: ${f.message}`));
	process.exit(1);
}

console.log("\nAll tests passed.");
process.exit(0);
