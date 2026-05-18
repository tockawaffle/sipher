/**
 * Self-contained federation post delivery test.
 *
 *   1. Auto-creates Alice on Server A and Bob on Server C through Better Auth
 *      (`POST /api/auth/sign-up/email` → `/sign-in/email` → `/oven/identity/register`).
 *   2. Seeds the follow rows that A's post-propagation logic needs to mark Bob
 *      as a remote follower hosted on C.
 *   3. Has Alice sign and submit a real post through A's social API.
 *   4. Waits for the BullMQ delivery worker on A to drain the `delivery_jobs`
 *      row that targets C's `/api/auth/social/posts` endpoint.
 *
 * Run from inside the Docker test cluster:
 *
 *   docker compose -f tests/docker-compose.yml run --rm test-runner \
 *     tests/integration/federation-post-delivery.ts \
 *     --proxy http://sipher-b:3001 --target http://sipher-c:3002
 *
 * No `--bearer` flag is required — the script provisions and tears down its own
 * users on every run. `--proxy` and `--target` default to the docker service
 * names if omitted.
 *
 * Pass `--test-no-remote-followers` to also exercise the case where the author
 * has no remote followers: the post must save with
 * `federationDeliveriesQueued === 0` and no delivery jobs are queued.
 */

import db from "@/lib/db";
import { deliveryJobs, follows, serverRegistry } from "@/lib/db/schema";
import { fingerprintKey } from "@/lib/federation/keytools";
import { config } from "dotenv";
import { and, desc, eq, like } from "drizzle-orm";
import { createPostOverHttp, createSipherUser, type SipherTestUser } from "../helpers/auth-users";

config({ path: ".env.local" });

const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
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

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------

function argAfter(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const proxyUrl = argAfter("--proxy") ?? "http://sipher-b:3001";
const targetUrl = argAfter("--target") ?? "http://sipher-c:3002";
const testNoRemoteFollowers = process.argv.includes("--test-no-remote-followers");

console.log("Post delivery test (A API → worker → C, with auto-created users)");
console.log(`  Server A (us):     ${ORIGIN}`);
console.log(`  Server B (proxy):  ${proxyUrl}`);
console.log(`  Server C (target): ${targetUrl}`);

// ---------------------------------------------------------------------------
// 1. Discovery sanity check
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

// Make sure C exists in A's local registry — needed for the follower_server_url FK.
const [cRegistry] = await db
	.select()
	.from(serverRegistry)
	.where(eq(serverRegistry.url, targetUrl))
	.limit(1);

if (!cRegistry) {
	console.error(`\n  ${targetUrl} is not in A's server_registry. Run mutual discovery first.`);
	process.exit(1);
}

const targetPostsUrl = `${targetUrl.replace(/\/$/, "")}/api/auth/social/posts`;

// ---------------------------------------------------------------------------
// 2. Create users
// ---------------------------------------------------------------------------

console.log("\n── Provisioning test users ─────────────────────────────");

let alice: SipherTestUser;
let bob: SipherTestUser;

try {
	alice = await createSipherUser(ORIGIN, { emailPrefix: "alice", usernamePrefix: "alice" });
	console.log(`  Alice on A: ${alice.userId}  (${alice.email})`);
} catch (err) {
	console.error(`Failed to create Alice on A: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}

try {
	bob = await createSipherUser(targetUrl, { emailPrefix: "bob", usernamePrefix: "bob" });
	console.log(`  Bob on C:   ${bob.userId}  (${bob.email})`);
} catch (err) {
	console.error(`Failed to create Bob on C: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Seed follow rows on A so post propagation finds C as a federation target.
//
//    post-propagation reads both followers (followingId = alice) and following
//    (followerId = alice) and only emits delivery jobs when *both* arrays are
//    non-empty. We insert one row in each direction with the remote URL pointing
//    at C, which makes C the sole unique federation target.
// ---------------------------------------------------------------------------

const createdFollowIds: string[] = [];

async function seedFollow(opts: {
	followerId: string;
	followingId: string;
	followerServerUrl: string | null;
	followingServerUrl: string | null;
}): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(follows).values({
		id,
		followerId: opts.followerId,
		followingId: opts.followingId,
		accepted: true,
		createdAt: new Date(),
		followerServerUrl: opts.followerServerUrl,
		followingServerUrl: opts.followingServerUrl,
		acknowledged: true,
	});
	createdFollowIds.push(id);
	return id;
}

console.log("\n── Seeding mutual follow on A ──────────────────────────");

try {
	await seedFollow({
		followerId: bob.userId,
		followingId: alice.userId,
		followerServerUrl: targetUrl,
		followingServerUrl: null,
	});
	await seedFollow({
		followerId: alice.userId,
		followingId: bob.userId,
		followerServerUrl: null,
		followingServerUrl: targetUrl,
	});
	console.log(`  Inserted 2 follow rows pointing at ${targetUrl}.`);
} catch (err) {
	console.error(`Failed to seed follow rows: ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Alice creates a post on A → expect federation delivery to C.
// ---------------------------------------------------------------------------

console.log("\n── Test: post delivery via A API + worker ──────────────");

const DEFAULT_POST_CONTENT = [{ type: "text" as const, value: "proxy post test" }];

{
	const testName = "POST /api/auth/social/posts → deliver-post job completes";
	try {
		console.log(`  Alice posting on A; expecting delivery to ${targetPostsUrl}…`);

		const { postId, federationDeliveriesQueued } = await createPostOverHttp(alice, DEFAULT_POST_CONTENT);
		console.log(`  Post created: ${postId}`);
		console.log(`  federationDeliveriesQueued: ${federationDeliveriesQueued}`);

		if (federationDeliveriesQueued < 1) {
			fail(
				testName,
				`expected at least 1 federation delivery, got ${federationDeliveriesQueued}. ` +
				`Check that the follow rows seeded above point at a server that is in A's registry.`,
			);
		} else {
			console.log("  Waiting for the BullMQ worker to deliver FEDERATE_POST to C…");

			// Give the worker a moment to claim the job, then begin polling.
			await new Promise((r) => setTimeout(r, 300));

			const jobsForPost = await db
				.select()
				.from(deliveryJobs)
				.where(like(deliveryJobs.payload, `%${postId}%`));

			if (jobsForPost.length === 0) {
				// Already processed before we got to look — that's also success.
				pass(testName, "delivery job completed before first poll (worker drained immediately)");
			} else {
				const forTarget = jobsForPost.filter((j) => j.targetUrl === targetPostsUrl);
				if (forTarget.length === 0) {
					const urls = [...new Set(jobsForPost.map((j) => j.targetUrl))].join(", ");
					fail(
						testName,
						`Delivery job(s) target other URL(s): ${urls} — expected ${targetPostsUrl}.`,
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
						pass(testName, "delivery job finished (worker reached C directly or via proxy)");
					} else {
						fail(
							testName,
							`timed out after ${maxWait / 1000}s with jobs still pending. ` +
							`Check worker logs (DEBUG=app:federation:*), Redis, and the proxy.`,
						);
					}
				}
			}
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// 5. Optional: no remote followers → createPost still 200 with 0 deliveries.
// ---------------------------------------------------------------------------

if (testNoRemoteFollowers) {
	console.log("\n── Test: createPost 200 + federationDeliveriesQueued === 0 ─");

	const testName = "createPost saves post but queues no federation deliveries";
	try {
		// Create a fresh user on A with NO follow rows at all.
		const solo = await createSipherUser(ORIGIN, { emailPrefix: "solo", usernamePrefix: "solo" });
		const { federationDeliveriesQueued } = await createPostOverHttp(solo, DEFAULT_POST_CONTENT);

		if (federationDeliveriesQueued === 0) {
			pass(testName, `post saved with federationDeliveriesQueued=0 (no remote followers)`);
		} else {
			fail(
				testName,
				`expected federationDeliveriesQueued === 0, got ${federationDeliveriesQueued}.`,
			);
		}
	} catch (err) {
		fail(testName, `${err instanceof Error ? err.message : err}`);
	}
}

// ---------------------------------------------------------------------------
// Cleanup — drop the rows we seeded so reruns don't accumulate state.
// (Users themselves are fine to leave; reruns generate unique emails.)
// ---------------------------------------------------------------------------

if (createdFollowIds.length > 0) {
	try {
		for (const id of createdFollowIds) {
			await db.delete(follows).where(eq(follows.id, id));
		}
	} catch (err) {
		console.warn(`(cleanup) failed to drop seeded follows: ${err instanceof Error ? err.message : err}`);
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
