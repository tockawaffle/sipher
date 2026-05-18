/**
 * Proxy chain integration test.
 *
 * Exercises the full A → B → C → B → A proxy relay against real federation
 * instances. This test focuses on the encrypted-routing layer and uses
 * `method: "PING"` envelopes so we can validate decrypt + signature + registry
 * checks without provisioning end-user accounts (post / follow scenarios that
 * require Better Auth users live in `federation-post-delivery.ts`, which now
 * auto-creates its own users via Better Auth).
 *
 * Run inside the Docker test cluster:
 *
 *   docker compose -f tests/docker-compose.yml run --rm test-runner \
 *     tests/integration/proxy-chain.ts \
 *     --proxy http://sipher-b:3001 --target http://sipher-c:3002
 *
 * `--proxy` and `--target` default to the docker service names if omitted.
 *
 * Tests:
 *   1. Full proxy relay (A → B → C → B → A) round-trips a PING envelope.
 *   2. Direct TARGETED (A → C) decrypts on C and echoes the nonce.
 *   3. TARGETED from an unregistered sender → C rejects (sender trust enforced).
 *   4. PROXY with mismatched signing key → B rejects (key match enforced).
 *   5. PROXY from an unknown federation origin → B rejects (registry enforced).
 *   6. Real failover: A's direct fetch to C fails → `federationFetch` falls back
 *      to B as proxy → the round-trip completes through the real proxy code path
 *      on every hop (no stubs, no manually-crafted envelopes from the script).
 */

import { serverRegistry } from "@/lib/db/schema";
import { federationFetch } from "@/lib/federation/fetch";
import { encryptPayload, fingerprintKey, signMessage } from "@/lib/federation/keytools";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import nacl from "tweetnacl";
import { createSipherUser } from "../helpers/auth-users";

config({ path: ".env.local" });

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FedKeys {
	signingPublicKey: string;
	signingSecretKey: string;
	encryptionPublicKey: string;
	encryptionSecretKey: string;
}

function generateEnvKeyPair(): FedKeys {
	const signing = nacl.sign.keyPair();
	const encryption = nacl.box.keyPair();
	return {
		signingPublicKey: Buffer.from(signing.publicKey).toString("base64"),
		signingSecretKey: Buffer.from(signing.secretKey).toString("base64"),
		encryptionPublicKey: Buffer.from(encryption.publicKey).toString("base64"),
		encryptionSecretKey: Buffer.from(encryption.secretKey).toString("base64"),
	};
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

// ---------------------------------------------------------------------------
// Validate environment
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
// Parse arguments
// ---------------------------------------------------------------------------

function argAfter(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const proxyUrl = argAfter("--proxy") ?? "http://sipher-b:3001";
const targetUrl = argAfter("--target") ?? "http://sipher-c:3002";

console.log("Proxy chain test");
console.log(`  Server A (us):    ${ORIGIN}`);
console.log(`  Server B (proxy): ${proxyUrl}`);
console.log(`  Server C (target): ${targetUrl}`);
console.log(`  A signing key:     ${fingerprintKey(OWN_SIGNING_PUB).slice(0, 16)}…`);
console.log(`  A encryption key:  ${fingerprintKey(OWN_ENCRYPTION_PUB).slice(0, 16)}…`);

// ---------------------------------------------------------------------------
// 1. Discovery check
// ---------------------------------------------------------------------------

interface DiscoverResponse {
	url: string;
	publicKey: string;
	encryptionPublicKey: string;
	peers: { url: string; isHealthy: boolean }[];
}

console.log("\n── Discovery ────────────────────────────────────────────");

async function fetchDiscover(url: string, label: string): Promise<DiscoverResponse> {
	try {
		const res = await fetch(`${url}/discover`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) {
			console.error(`${label} (${url}) returned ${res.status}: ${await readErrorBody(res)}`);
			process.exit(1);
		}
		const body = (await res.json()) as DiscoverResponse;
		console.log(`  ${label}: ${body.url}`);
		console.log(`     signing:    ${fingerprintKey(body.publicKey).slice(0, 16)}…`);
		console.log(`     encryption: ${fingerprintKey(body.encryptionPublicKey).slice(0, 16)}…`);
		console.log(`     peers: ${body.peers.length}`);
		return body;
	} catch (err) {
		console.error(`Cannot reach ${label} at ${url}/discover: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}
}

const proxyInfo = await fetchDiscover(proxyUrl, "B");
const targetInfo = await fetchDiscover(targetUrl, "C");

const aOnB = proxyInfo.peers.some((p) => p.url === ORIGIN);
const aOnC = targetInfo.peers.some((p) => p.url === ORIGIN);
console.log(`  A registered on B: ${aOnB}`);
console.log(`  A registered on C: ${aOnC}`);

if (!aOnB || !aOnC) {
	console.error(
		"\n  A is not registered on at least one peer. Run mutual discovery first:\n" +
		"    docker compose -f tests/docker-compose.yml --profile setup up",
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Full proxy relay: A → B → C → B → A
// ---------------------------------------------------------------------------

console.log("\n── Test: Full proxy relay (A → B → C → B → A) ─────────");

{
	const testName = "full proxy relay";
	try {
		const nonce = crypto.randomUUID();
		// Encrypt a PING payload with C's public key so C can decrypt and verify
		// the full A→B→C→B→A crypto routing without needing real user data.
		const innerPayload = JSON.stringify({ method: "PING", nonce, sender: ORIGIN });

		const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const encrypted = encryptPayload(innerPayload, targetEncKey);

		const proxyBody = {
			method: "PROXY",
			targetUrl: targetUrl + "/proxy",
			publicSigningKey: OWN_SIGNING_PUB,
			publicEncryptionKey: OWN_ENCRYPTION_PUB,
			payload: encrypted,
		};

		const res = await fetch(`${proxyUrl}/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": ORIGIN,
				"Origin": ORIGIN,
			},
			body: JSON.stringify(proxyBody),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const body = await res.json();

		if (res.status !== 200) {
			fail(testName, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
		} else if (body.method !== "PROXY_RESPONSE") {
			fail(testName, `expected method=PROXY_RESPONSE, got ${body.method}`);
		} else if (!body.payload) {
			fail(testName, "response missing payload (B did not relay C's response)");
		} else if (body.payload.method !== "PROXY_RESPONSE") {
			fail(testName, `inner payload method=${body.payload.method}, expected PROXY_RESPONSE`);
		} else if (body.payload.nonce !== nonce) {
			fail(testName, `nonce mismatch: sent ${nonce}, C echoed ${body.payload.nonce}`);
		} else {
			pass(testName, `nonce round-trip OK (${nonce})`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 3. Direct TARGETED: A → C
// ---------------------------------------------------------------------------

console.log("\n── Test: Direct TARGETED (A → C) ────────────────────────");

{
	const testName = "direct TARGETED to C";
	try {
		const nonce = crypto.randomUUID();
		const innerPayload = JSON.stringify({ method: "PING", nonce, sender: ORIGIN });

		const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const encrypted = encryptPayload(innerPayload, targetEncKey);

		const res = await fetch(`${targetUrl}/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": ORIGIN,
				"Origin": ORIGIN,
			},
			body: JSON.stringify({
				method: "TARGETED",
				payload: encrypted,
			}),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const body = await res.json();

		if (res.status !== 200) {
			fail(testName, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
		} else if (body.method !== "PROXY_RESPONSE") {
			fail(testName, `expected method=PROXY_RESPONSE, got ${body.method}`);
		} else if (body.nonce !== nonce) {
			fail(testName, `nonce mismatch: sent ${nonce}, C echoed ${body.nonce}`);
		} else {
			pass(testName, `nonce round-trip OK (${nonce}), C status: ${body.status}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 4. TARGETED rejection — unregistered sender → C
// ---------------------------------------------------------------------------

console.log("\n── Test: TARGETED from unregistered sender → C ─────────");

{
	const testName = "reject unregistered TARGETED sender";
	try {
		const fakeOrigin = "https://totally-unknown-federation-" + crypto.randomUUID().slice(0, 8) + ".test";
		const innerPayload = JSON.stringify({ method: "PING", nonce: crypto.randomUUID() });

		const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const encrypted = encryptPayload(innerPayload, targetEncKey);

		const res = await fetch(`${targetUrl}/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": fakeOrigin,
				"Origin": fakeOrigin,
			},
			body: JSON.stringify({
				method: "TARGETED",
				payload: encrypted,
			}),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const body = await res.json();

		if (res.status === 403 && body.code === "UNKNOWN_FEDERATION_SERVER_INTERACTION") {
			pass(testName, `C correctly rejected: "${body.error}"`);
		} else {
			fail(testName, `expected 403/UNKNOWN_FEDERATION_SERVER_INTERACTION, got ${res.status}/${body.code}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 5. Sender validation — bad signing key
// ---------------------------------------------------------------------------

console.log("\n── Test: Sender validation (bad keys → B) ──────────────");

{
	const testName = "reject mismatched signing key";
	try {
		const fakeKeys = generateEnvKeyPair();

		const innerPayload = JSON.stringify({ method: "PING", nonce: crypto.randomUUID() });
		const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const encrypted = encryptPayload(innerPayload, targetEncKey);

		const proxyBody = {
			method: "PROXY",
			targetUrl: targetUrl + "/proxy",
			publicSigningKey: fakeKeys.signingPublicKey,
			publicEncryptionKey: OWN_ENCRYPTION_PUB,
			payload: encrypted,
		};

		const res = await fetch(`${proxyUrl}/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": ORIGIN,
				"Origin": ORIGIN,
			},
			body: JSON.stringify(proxyBody),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const body = await res.json();

		if (res.status === 403 && body.code === "INCORRECT_KEYS") {
			pass(testName, `B correctly rejected: "${body.error}"`);
		} else {
			fail(testName, `expected 403/INCORRECT_KEYS, got ${res.status}/${body.code}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 6. Unknown sender
// ---------------------------------------------------------------------------

console.log("\n── Test: Unknown sender (→ B) ────────────────────────────");

{
	const testName = "reject unknown sender";
	try {
		const unknownKeys = generateEnvKeyPair();
		const unknownOrigin = "https://totally-unknown-federation-" + crypto.randomUUID().slice(0, 8) + ".test";

		const innerPayload = JSON.stringify({ method: "PING", nonce: crypto.randomUUID() });
		const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const encrypted = encryptPayload(innerPayload, targetEncKey);

		const proxyBody = {
			method: "PROXY",
			targetUrl: targetUrl + "/proxy",
			publicSigningKey: unknownKeys.signingPublicKey,
			publicEncryptionKey: unknownKeys.encryptionPublicKey,
			payload: encrypted,
		};

		const res = await fetch(`${proxyUrl}/proxy`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": unknownOrigin,
				"Origin": unknownOrigin,
			},
			body: JSON.stringify(proxyBody),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const body = await res.json();

		if (res.status === 403 && body.code === "UNKNOWN_FEDERATION_SERVER_INTERACTION") {
			pass(testName, `B correctly rejected: "${body.error}"`);
		} else {
			fail(testName, `expected 403/UNKNOWN_FEDERATION_SERVER_INTERACTION, got ${res.status}/${body.code}: ${JSON.stringify(body)}`);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 7. Real failover via federationFetch
//
// Drives the full failover code path on A's side — not a manually crafted
// PROXY envelope from the test script. We invoke A's actual
// `federationFetch(url, { serverUrl, proxyFallback: true, ... })` against a
// deliberately unreachable hostname so the direct call fails with
// `DNS_BLOCKED` (the proxy-eligible failure class in the threat model). That
// triggers the proxy fallback, which:
//
//   • picks B as a healthy proxy via the registry
//   • encrypts the request to C's encryption key
//   • POSTs a PROXY envelope to B (real B, with real signing/registry checks)
//   • B forwards it as TARGETED to C (real C, full schema + signature checks)
//   • C processes a real FEDERATE_FOLLOW with users that exist on both servers
//
// The round-trip ack comes back through B verbatim, proving the entire flow
// works without stubs, without script-crafted envelopes, and with the real
// failover trigger in `federationFetch`.
// ---------------------------------------------------------------------------

console.log("\n── Test: real failover (A → C direct FAILS → A → B → C proxy SUCCEEDS) ─");

{
	const testName = "real failover via federationFetch";
	// `sipher-unreachable.test` is allow-listed in DEV_ALLOWED_HOSTNAMES (so
	// url-guard passes) but does not resolve via Docker DNS, producing
	// ENOTFOUND → UNKNOWN/DNS_BLOCKED → proxy-eligible per the threat model.
	// The path `/api/auth/social/follows` matters because C's TARGETED router
	// branches on it to dispatch FEDERATE_FOLLOW.
	const sabotagedUrl = "http://sipher-unreachable.test:9999/api/auth/social/follows";
	const sabotagedOrigin = new URL(sabotagedUrl).origin;

	// `attemptProxyRoute` puts the original failing URL into the inner
	// encrypted payload (`innerPayload.targetUrl = url`). When C processes the
	// FEDERATE_FOLLOW, it derives `following_server_url` from that URL — and
	// the `follows.following_server_url` column has an FK to server_registry.
	// In production both A and B would be reaching the *same* real URL for C,
	// so the FK target is already in C's registry. Our test deliberately
	// breaks A's path while keeping B's path intact, so we seed the sabotaged
	// URL as a placeholder registry row on C just to satisfy the FK. The keys
	// are dummies — they're never used (sender validation runs against A's
	// real keys via X-Federation-Origin).
	const cDbUrl = process.env.DATABASE_URL!.replace(/\/sipher_a(\?|$)/, "/sipher_c$1");
	const cPool = new Pool({ connectionString: cDbUrl });
	const cDb = drizzle(cPool, { schema: { serverRegistry } });
	const dummyKeys = generateEnvKeyPair();
	try {
		await cDb.insert(serverRegistry).values({
			id: crypto.randomUUID(),
			url: sabotagedOrigin,
			publicKey: dummyKeys.signingPublicKey,
			encryptionPublicKey: dummyKeys.encryptionPublicKey,
			lastSeen: new Date(),
			createdAt: new Date(),
			updatedAt: new Date(),
			isHealthy: true,
		}).onConflictDoNothing();

		console.log("  Provisioning Alice on A and Bob on C…");
		const alice = await createSipherUser(ORIGIN, {
			emailPrefix: "alice-failover",
			usernamePrefix: "alice_fo",
		});
		const bob = await createSipherUser(targetUrl, {
			emailPrefix: "bob-failover",
			usernamePrefix: "bob_fo",
		});
		console.log(`  Alice: ${alice.userId}  Bob: ${bob.userId}`);

		// Build the FEDERATE follow body C will ultimately receive after the
		// proxy hop. Inner is signed by A so C's signature check passes, and
		// encrypted to C's encryption key so only C can decrypt the envelope.
		const innerFollow = {
			following: {
				id: crypto.randomUUID(),
				createdAt: new Date().toISOString(),
				followerId: alice.userId,
				followingId: bob.userId,
				accepted: false,
				followerServerUrl: ORIGIN,
			},
			federationUrl: ORIGIN,
			method: "FEDERATE" as const,
		};
		const innerRaw = JSON.stringify(innerFollow);
		const aSigningSecret = new Uint8Array(
			Buffer.from(process.env.FEDERATION_PRIVATE_KEY!, "base64"),
		);
		const signature = signMessage(innerRaw, aSigningSecret);
		const cEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
		const followEnvelope = encryptPayload(innerRaw, cEncKey);

		const fedRequestBody = JSON.stringify({
			method: "FEDERATE",
			payload: followEnvelope,
			signature,
		});

		const result = await federationFetch(sabotagedUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Federation-Origin": ORIGIN,
				"X-Federation-Target": sabotagedUrl,
				"Origin": ORIGIN,
			},
			body: fedRequestBody,
			// Overrides `extractServerUrl` so the proxy peer forwards to C's
			// real URL, not the sabotaged one — proves that the real C URL is
			// what the proxy chain uses.
			serverUrl: targetUrl,
			proxyFallback: true,
			timeout: 20_000,
		});

		if (!result.proxied) {
			fail(testName, "federationFetch did NOT use proxy — the direct call to sipher-unreachable.test must have unexpectedly succeeded");
		} else if (!result.response.ok) {
			fail(testName, `proxy response status=${result.response.status}: ${await readErrorBody(result.response)}`);
		} else {
			const body = await result.response.json();
			if (body.method !== "PROXY_RESPONSE") {
				fail(testName, `expected method=PROXY_RESPONSE, got ${body.method}`);
			} else if (!body.payload) {
				fail(testName, "expected outer PROXY_RESPONSE.payload from B (relay envelope missing)");
			} else if (body.payload.method !== "PROXY_RESPONSE") {
				fail(testName, `expected payload.method=PROXY_RESPONSE from C, got ${body.payload?.method}`);
			} else if (body.payload.status !== "acknowledged") {
				fail(testName, `expected payload.status=acknowledged from C, got ${body.payload?.status}`);
			} else {
				pass(
					testName,
					`A → ${result.proxyPeer} (proxy) → ${targetUrl} succeeded after direct failed; ack from C carried back through B`,
				);
			}
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	} finally {
		try {
			await cDb.delete(serverRegistry).where(eq(serverRegistry.url, sabotagedOrigin));
		} catch (cleanupErr) {
			console.warn(`  (cleanup) could not remove fake server row: ${cleanupErr instanceof Error ? cleanupErr.message : cleanupErr}`);
		}
		await cPool.end();
	}
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

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
