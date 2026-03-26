/**
 * Manual post proxy / federation test (Server A).
 *
 * Exercises the real path only — same as production:
 *   POST ${A}/api/auth/social/posts → BullMQ worker → federationFetch (direct or via proxy B) → C.
 *
 * Does not POST ciphertext to B’s `/proxy` by hand; the worker does that after your createPost.
 *
 * Usage:
 *   bun run tests/proxies/post.ts --proxy <B_URL> --target <C_URL> --bearer <session_on_A>
 *
 * Prerequisites on A:
 *   - Bearer user must have at least one accepted follower whose `followerServerUrl` points at C
 *     (same base URL as `--target` / registry).
 *   - Propagation must enqueue jobs (e.g. policy `all`, or private + `followers`).
 *
 * Optional:
 *   --test-fallback     C blocked from A: load C from A’s server_registry only; verify direct C fetch fails first
 *   --test-no-remote-followers   Expect 200 with federationDeliveriesQueued === 0 (propagation on, no remote follower URLs)
 *
 * Examples:
 *   bun run tests/proxies/post.ts --proxy http://localhost:3001 --target http://host.docker.internal:3002 --bearer <tok> --test-fallback
 */

import db from "@/lib/db";
import { deliveryJobs, serverRegistry } from "@/lib/db/schema";
import { fingerprintKey } from "@/lib/federation/keytools";
import { config } from "dotenv";
import { and, desc, eq, like } from "drizzle-orm";

config({ path: ".env.local" });

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
const testNoRemoteFollowers = process.argv.includes("--test-no-remote-followers");
const isFallbackMode = process.argv.includes("--test-fallback");

if (!proxyUrl || !targetUrl || !bearerToken) {
	console.error(
		"Usage: bun run tests/proxies/post.ts --proxy <B_URL> --target <C_URL> --bearer <session_on_A> [options]",
	);
	console.error("");
	console.error("  --proxy                         Server B (proxy); used for /discover sanity check");
	console.error("  --target                        Server C base URL (must match server_registry.url on A for --test-fallback)");
	console.error("  --bearer                        Session token on A (required — test hits POST /api/auth/social/posts)");
	console.error("  --test-fallback                 C unreachable from A; load C from registry; verify block then deliver via API");
	console.error("  --test-no-remote-followers      Expect createPost 400 NO_REMOTE_FOLLOWERS (runs after main test if set)");
	process.exit(1);
}

if (testNoRemoteFollowers && !bearerToken) {
	console.error("--test-no-remote-followers requires --bearer <tok>");
	process.exit(1);
}

console.log("Post delivery test (A API → worker → federation/proxy)");
console.log(`  Server A (us):    ${ORIGIN}`);
console.log(`  Server B (proxy): ${proxyUrl}`);
console.log(`  Server C (target): ${targetUrl}`);

const DEFAULT_POST_CONTENT = [{ type: "text" as const, value: "proxy post test" }];

// ---------------------------------------------------------------------------
// 1. Discovery (B reachable from A; C from registry or live)
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

if (isFallbackMode) {
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
	console.log(`  C: ${targetInfo.url} (from local registry — blocked from A)`);
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
		console.error("\n  If C is firewalled from A, pass --test-fallback (load C from A’s registry).");
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

const targetPostsUrl = `${targetInfo.url.replace(/\/$/, "")}/api/auth/social/posts`;

// ---------------------------------------------------------------------------
// 2. Optional: confirm C is unreachable when --test-fallback
// ---------------------------------------------------------------------------

if (isFallbackMode) {
	console.log("\n── Test: direct fetch to C fails (blocked) ─────────────");

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

// ---------------------------------------------------------------------------
// 3. Real createPost on A → worker → C (via proxy when needed)
// ---------------------------------------------------------------------------

console.log("\n── Test: post delivery via A API + worker ──────────────");

{
	const testName = "POST /api/auth/social/posts → deliver-post job completes";
	try {
		console.log(`  Creating post on A; expecting delivery to ${targetPostsUrl}…`);

		const postRes = await fetch(`${ORIGIN}/api/auth/social/posts`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${bearerToken}`,
			},
			body: JSON.stringify(DEFAULT_POST_CONTENT),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const postBody = await postRes.json();

		if (!postRes.ok) {
			fail(
				testName,
				`createPost failed (${postRes.status}): ${JSON.stringify(postBody)} — need accepted remote followers on C and propagating policy`,
			);
		} else {
			const postId = postBody.id as string | undefined;
			if (!postId) {
				fail(testName, `no post id in response: ${JSON.stringify(postBody)}`);
			} else {
				console.log(`  Post created: ${postId}`);
				console.log("  Waiting for BullMQ worker to deliver FEDERATE_POST…");

				await new Promise((r) => setTimeout(r, 300));

				const jobsForPost = await db
					.select()
					.from(deliveryJobs)
					.where(like(deliveryJobs.payload, `%${postId}%`));

				if (jobsForPost.length === 0) {
					fail(
						testName,
						"No delivery_jobs row for this post after createPost — propagation off, federationDeliveriesQueued was 0, or bug.",
					);
				} else {
					const forTarget = jobsForPost.filter((j) => j.targetUrl === targetPostsUrl);
					if (forTarget.length === 0) {
						const urls = [...new Set(jobsForPost.map((j) => j.targetUrl))].join(", ");
						fail(
							testName,
							`Delivery job(s) target other URL(s): ${urls} — expected ${targetPostsUrl} (followerServerUrl must match C).`,
						);
					} else {
						const maxWait = 60_000;
						const pollInterval = 2_000;
						let elapsed = 300;
						let delivered = false;

						while (elapsed < maxWait) {
							await new Promise((r) => setTimeout(r, pollInterval));
							elapsed += pollInterval;

							const pendingJobs = await db
								.select()
								.from(deliveryJobs)
								.where(
									and(
										eq(deliveryJobs.targetUrl, targetPostsUrl),
										like(deliveryJobs.payload, `%${postId}%`),
									),
								)
								.orderBy(desc(deliveryJobs.createdAt))
								.limit(5);

							process.stdout.write(
								`\r  Polling… ${Math.round(elapsed / 1000)}s — pending jobs for this post: ${pendingJobs.length}   `,
							);

							if (pendingJobs.length === 0) {
								delivered = true;
								break;
							}
						}

						console.log("");

						if (delivered) {
							pass(testName, "delivery job finished (worker reached C, direct or via proxy)");
						} else {
							fail(
								testName,
								`timed out after ${maxWait / 1000}s with jobs still pending. ` +
								`Check worker (DEBUG=app:federation:*), Redis, proxy, and firewall.`,
							);
						}
					}
				}
			}
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 4. Optional: propagation on but no remote URLs (200, zero deliveries)
// ---------------------------------------------------------------------------

if (testNoRemoteFollowers) {
	console.log("\n── Test: createPost 200 + federationDeliveriesQueued === 0 ─");

	const testName = "createPost saves post but queues no federation deliveries";
	try {
		const postRes = await fetch(`${ORIGIN}/api/auth/social/posts`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${bearerToken}`,
			},
			body: JSON.stringify(DEFAULT_POST_CONTENT),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});

		const postBody = await postRes.json();

		if (
			postRes.status === 200 &&
			postBody.id &&
			postBody.federationDeliveriesQueued === 0
		) {
			pass(testName, `post ${postBody.id} — no remote follower server URLs under propagation`);
		} else if (postRes.ok && postBody.federationDeliveriesQueued > 0) {
			fail(
				testName,
				`expected federationDeliveriesQueued === 0, got ${postBody.federationDeliveriesQueued} (user has remote followers or wrong test account).`,
			);
		} else {
			fail(
				testName,
				`expected 200 with id and federationDeliveriesQueued 0, got ${postRes.status}: ${JSON.stringify(postBody)}`,
			);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
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
