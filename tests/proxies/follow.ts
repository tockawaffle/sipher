/**
 * Manual proxy chain test script.
 *
 * You need 3 different instances up and running to use this test script. That includes yours.
 * 
 * Exercises the full A → B → C → B → A proxy relay against real federation
 * instances.  Run this from Server A while Server B (proxy) and Server C
 * (target) are already up.
 *
 * Usage:
 *   bun run testProxy.ts --proxy <B_URL> --target <C_URL>
 *
 * Examples:
 *   bun run testProxy.ts --proxy https://proxy.example.com --target https://target.example.com
 *   bun run testProxy.ts --proxy http://localhost:3001 --target http://localhost:3002
 */

import db from "@/lib/db";
import { deliveryJobs, follows, serverRegistry } from "@/lib/db/schema";
import { encryptPayload, fingerprintKey, signMessage } from "@/lib/federation/keytools";
import { config } from "dotenv";
import { desc, eq } from "drizzle-orm";
import nacl from "tweetnacl";

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

function generateKeypair(): FedKeys {
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
	console.error("Ensure .env.local is present and populated.");
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

const proxyUrl = argAfter("--proxy");
const targetUrl = argAfter("--target");
const bearerToken = argAfter("--bearer");
const targetUserId = argAfter("--user");

if (!proxyUrl || !targetUrl) {
	console.error("Usage: bun run testProxy.ts --proxy <B_URL> --target <C_URL> [options]");
	console.error("");
	console.error("  --proxy          URL of Server B (the proxy)");
	console.error("  --target         URL of Server C (the target)");
	console.error("  --test-fallback  Enable proxy fallback test (requires C blocked from A)");
	console.error("  --bearer <tok>   Bearer token for A's API (required for --test-fallback)");
	console.error("  --user <id>      User ID on Server C to follow (required for --test-fallback)");
	process.exit(1);
}

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

let proxyInfo: DiscoverResponse;
let targetInfo: DiscoverResponse;

try {
	const res = await fetch(`${proxyUrl}/discover`, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});
	if (!res.ok) {
		console.error(`Server B (${proxyUrl}) returned ${res.status}: ${await readErrorBody(res)}`);
		process.exit(1);
	}
	proxyInfo = await res.json();
	console.log(`  B: ${proxyInfo.url}`);
	console.log(`     signing:    ${fingerprintKey(proxyInfo.publicKey).slice(0, 16)}…`);
	console.log(`     encryption: ${fingerprintKey(proxyInfo.encryptionPublicKey).slice(0, 16)}…`);
	console.log(`     peers: ${proxyInfo.peers.length}`);
} catch (err) {
	console.error(`Cannot reach Server B at ${proxyUrl}/discover: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}

const isFallbackMode = process.argv.includes("--test-fallback");

if (isFallbackMode) {
	// C is blocked from A — load C's info from A's local registry instead
	const [cRecord] = await db.select().from(serverRegistry).where(eq(serverRegistry.url, targetUrl)).limit(1);
	if (!cRecord) {
		console.error(`  Server C (${targetUrl}) not found in local registry. Run mutual discovery before blocking.`);
		process.exit(1);
	}
	targetInfo = {
		url: cRecord.url,
		publicKey: cRecord.publicKey,
		encryptionPublicKey: cRecord.encryptionPublicKey,
		peers: [],
	};
	console.log(`  C: ${targetInfo.url} (from local registry — blocked)`);
	console.log(`     signing:    ${fingerprintKey(targetInfo.publicKey).slice(0, 16)}…`);
	console.log(`     encryption: ${fingerprintKey(targetInfo.encryptionPublicKey).slice(0, 16)}…`);
} else {
	try {
		const res = await fetch(`${targetUrl}/discover`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			console.error(`Server C (${targetUrl}) returned ${res.status}: ${await readErrorBody(res)}`);
			process.exit(1);
		}
		targetInfo = await res.json();
		console.log(`  C: ${targetInfo.url}`);
		console.log(`     signing:    ${fingerprintKey(targetInfo.publicKey).slice(0, 16)}…`);
		console.log(`     encryption: ${fingerprintKey(targetInfo.encryptionPublicKey).slice(0, 16)}…`);
		console.log(`     peers: ${targetInfo.peers.length}`);
	} catch (err) {
		console.error(`Cannot reach Server C at ${targetUrl}/discover: ${err instanceof Error ? err.message : err}`);
		process.exit(1);
	}
}

const aOnB = proxyInfo.peers.some((p) => p.url === ORIGIN);
console.log(`  A registered on B: ${aOnB}`);

if (!aOnB) {
	console.error("\n  A is not registered on B. Run mutual discovery first.");
	process.exit(1);
}

if (!isFallbackMode) {
	const aOnC = targetInfo.peers.some((p) => p.url === ORIGIN);
	console.log(`  A registered on C: ${aOnC}`);
	if (!aOnC) {
		console.error("\n  A is not registered on C. Run mutual discovery first.");
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// 2–5: Direct tests (skipped in --test-fallback mode since C is blocked)
// ---------------------------------------------------------------------------

if (isFallbackMode) {
	console.log("\n  Skipping direct tests (2–5) — C is blocked in fallback mode.");
}

if (!isFallbackMode) {

	// ---------------------------------------------------------------------------
	// 2. Full proxy relay: A → B → C → B → A
	// ---------------------------------------------------------------------------

	console.log("\n── Test: Full proxy relay (A → B → C → B → A) ─────────");

	{
		const testName = "full proxy relay";
		try {
			const nonce = crypto.randomUUID();
			const innerPayload = JSON.stringify({
				action: "proxy-test",
				nonce,
				timestamp: Date.now(),
				sender: ORIGIN,
			});

			const targetEncKey = new Uint8Array(Buffer.from(targetInfo.encryptionPublicKey, "base64"));
			const encrypted = encryptPayload(innerPayload, targetEncKey);
			const signature = signMessage(innerPayload, new Uint8Array(Buffer.from(process.env.FEDERATION_PRIVATE_KEY!, "base64")));

			const proxyBody = {
				method: "PROXY",
				targetUrl: targetUrl + "/proxy",
				publicSigningKey: OWN_SIGNING_PUB,
				publicEncryptionKey: OWN_ENCRYPTION_PUB,
				payload: encrypted,
				signature,
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
			} else {
				pass(testName, `nonce=${nonce}, C responded: "${body.payload.message ?? JSON.stringify(body.payload)}"`);
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
			const innerPayload = JSON.stringify({
				action: "targeted-test",
				nonce: crypto.randomUUID(),
				sender: ORIGIN,
			});

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
			} else {
				pass(testName, `C says: "${body.message}"`);
			}
		} catch (err) {
			fail(testName, `${err instanceof Error ? err.message : err}`);
		}
	}

	// ---------------------------------------------------------------------------
	// 4. Sender validation — bad signing key
	// ---------------------------------------------------------------------------

	console.log("\n── Test: Sender validation (bad keys → B) ──────────────");

	{
		const testName = "reject mismatched signing key";
		try {
			const fakeKeys = generateKeypair();

			const innerPayload = JSON.stringify({ action: "bad-key-test" });
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
	// 5. Unknown sender
	// ---------------------------------------------------------------------------

	console.log("\n── Test: Unknown sender (→ B) ────────────────────────────");

	{
		const testName = "reject unknown sender";
		try {
			const unknownKeys = generateKeypair();
			const unknownOrigin = "https://totally-unknown-federation-" + crypto.randomUUID().slice(0, 8) + ".test";

			const innerPayload = JSON.stringify({ action: "unknown-sender-test" });
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

} // end if (!isFallbackMode)

// ---------------------------------------------------------------------------
// 6. Auto proxy fallback via real follow delivery pipeline
//    Sends a follow request through A's API → BullMQ worker picks it up →
//    federationFetch with proxyFallback:true → direct to C fails → proxied
//    through B → C processes → worker updates follow.accepted
//
//    Requires:
//      - Server C blocked from A (firewall)
//      - --bearer <token> and --user <userId> flags
//
//    Block C:   netsh advfirewall firewall add rule name="Block Federation C" dir=out action=block remoteip=<C_IP> remoteport=<C_PORT> protocol=tcp
//    Unblock:   netsh advfirewall firewall delete rule name="Block Federation C"
// ---------------------------------------------------------------------------

if (isFallbackMode) {
	console.log("\n── Test: Auto proxy fallback (follow delivery pipeline) ─");

	if (!bearerToken || !targetUserId) {
		console.error("  --test-fallback requires --bearer <token> and --user <userId>");
		process.exit(1);
	}

	// Step 1: verify C is unreachable directly
	{
		const testName = "direct fetch to C fails";
		try {
			const res = await fetch(`${targetUrl}/discover`, {
				signal: AbortSignal.timeout(5_000),
			});
			fail(testName, `direct fetch succeeded (${res.status}) — C is not blocked from A. Block it first.`);
		} catch {
			pass(testName, "C is unreachable from A (blocked)");
		}
	}

	// Step 2: send follow request through A's API
	{
		const testName = "follow delivery via proxy fallback";
		try {
			console.log(`  Sending follow request for user ${targetUserId} on ${targetUrl}...`);

			const followRes = await fetch(`${ORIGIN}/api/auth/social/follows`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${bearerToken}`,
				},
				body: JSON.stringify({
					method: "INSERT",
					userId: targetUserId,
					federationUrl: targetUrl,
				}),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});

			const followBody = await followRes.json();

			if (!followRes.ok) {
				fail(testName, `follow request failed (${followRes.status}): ${JSON.stringify(followBody)}`);
			} else {
				const followId = followBody.following?.[0]?.id;
				if (!followId) {
					fail(testName, `follow created but no ID returned: ${JSON.stringify(followBody)}`);
				} else {
					console.log(`  Follow record created: ${followId}`);
					console.log("  Waiting for BullMQ worker to process delivery job...");

					// Step 3: poll until the delivery job completes (worker processes it)
					const maxWait = 60_000;
					const pollInterval = 2_000;
					let elapsed = 0;
					let delivered = false;

					while (elapsed < maxWait) {
						await new Promise((r) => setTimeout(r, pollInterval));
						elapsed += pollInterval;

						// Check if delivery job for this target still exists (removed on success)
						const pendingJobs = await db.select()
							.from(deliveryJobs)
							.where(eq(deliveryJobs.targetUrl, targetUrl + "/api/auth/social/follows"))
							.orderBy(desc(deliveryJobs.createdAt))
							.limit(5);

						// Check if follow.accepted was updated (worker sets this on success)
						const [followRecord] = await db.select()
							.from(follows)
							.where(eq(follows.id, followId))
							.limit(1);

						const jobCount = pendingJobs.length;
						const accepted = followRecord?.accepted;

						process.stdout.write(`\r  Polling... ${Math.round(elapsed / 1000)}s — jobs pending: ${jobCount}, accepted: ${accepted}   `);

						if (accepted === true) {
							delivered = true;
							break;
						}
					}

					console.log("");

					if (delivered) {
						pass(testName, "follow delivered through proxy and accepted by C");
					} else {
						// Check final state for diagnostics
						const [finalFollow] = await db.select()
							.from(follows)
							.where(eq(follows.id, followId))
							.limit(1);

						const remainingJobs = await db.select()
							.from(deliveryJobs)
							.where(eq(deliveryJobs.targetUrl, targetUrl + "/api/auth/social/follows"))
							.limit(5);

						fail(testName,
							`timed out after ${maxWait / 1000}s. ` +
							`follow.accepted=${finalFollow?.accepted}, ` +
							`pending delivery jobs=${remainingJobs.length}. ` +
							`Check worker logs (DEBUG=app:federation:*) for details.`,
						);
					}

					// Cleanup: remove the test follow record
					console.log("  Cleaning up test follow record...");
					// await db.delete(follows).where(eq(follows.id, followId));
				}
			}
		} catch (err) {
			fail(testName, `${err instanceof Error ? err.message : err}`);
		}
	}
} else {
	console.log("\n  Skipping auto-fallback test (pass --test-fallback to enable).");
	console.log("  Requires: --test-fallback --bearer <token> --user <userId>");
	console.log("  And C must be blocked from A's machine (firewall rule).");
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
