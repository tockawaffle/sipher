/**
 * Censorship-resistance scenarios for the federation layer.
 *
 * Spins up four SiPher nodes (A, B, C, D) as local Bun processes, each loaded
 * with `tests/support/netsim.ts` so a scenario can censor a node's view of the
 * network (DNS block, refused connection, silent drop) or kill a node outright.
 * Every scenario exercises the real path: Alice posts on A over HTTP, the
 * BullMQ worker on A delivers to Bob's server C (directly or through a proxy
 * peer), and the test polls C's database for the federated post.
 *
 * Prerequisites (see tests/support/run-censorship.sh, which does all of this):
 *   - Postgres with databases sipher_a..sipher_d and the schema pushed
 *   - Redis on localhost:6379
 *   - /etc/hosts mapping sipher-a..sipher-d to 127.0.0.1
 *   - tests/docker/sipher-{a,b,c,d}.env with federation keys
 *
 * Usage:
 *   bun tests/integration/censorship.ts [--only S1,S2]
 */

import { Queue } from "bullmq";
import { spawn, type Subprocess } from "bun";
import { config } from "dotenv";
import Redis from "ioredis";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { createPostOverHttp, createSipherUser, type SipherTestUser } from "../helpers/auth-users";

type NodeId = "a" | "b" | "c" | "d";
const NODE_IDS: NodeId[] = ["a", "b", "c", "d"];
const PORTS: Record<NodeId, number> = { a: 3000, b: 3001, c: 3002, d: 3003 };
const url = (id: NodeId) => `http://sipher-${id}:${PORTS[id]}`;
const host = (id: NodeId) => `sipher-${id}`;

const NETSIM_DIR = "/tmp/sipher-netsim";
const LOG_DIR = "/tmp/sipher-censorship-logs";
mkdirSync(NETSIM_DIR, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

const only = (() => {
	const i = process.argv.indexOf("--only");
	return i >= 0 ? new Set(process.argv[i + 1].split(",")) : null;
})();

// ---------------------------------------------------------------------------
// Node processes
// ---------------------------------------------------------------------------

const envs: Record<NodeId, Record<string, string>> = {} as never;
for (const id of NODE_IDS) {
	envs[id] = config({ path: `tests/docker/sipher-${id}.env`, processEnv: {} }).parsed ?? {};
}

const procs: Partial<Record<NodeId, Subprocess>> = {};

function logPath(id: NodeId) {
	return `${LOG_DIR}/${id}.log`;
}

function logSize(id: NodeId): number {
	try {
		return readFileSync(logPath(id)).length;
	} catch {
		return 0;
	}
}

function logSince(id: NodeId, offset: number): string {
	try {
		return readFileSync(logPath(id)).subarray(offset).toString("utf8");
	} catch {
		return "";
	}
}

async function waitUp(id: NodeId, timeoutMs = 20_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`http://localhost:${PORTS[id]}/`, { signal: AbortSignal.timeout(1_000) });
			if (res.ok) return;
		} catch { }
		await Bun.sleep(300);
	}
	throw new Error(`node ${id} did not come up`);
}

async function startNode(id: NodeId) {
	const file = Bun.file(logPath(id));
	const existing = (await file.exists()) ? await file.text() : "";
	const writer = Bun.file(logPath(id)).writer();
	writer.write(existing);
	const proc = spawn(["bun", "--preload", "./tests/support/netsim.ts", "src/server.ts"], {
		env: {
			...process.env,
			...envs[id],
			SIPHER_NODE: id,
			SIPHER_NETSIM_DIR: NETSIM_DIR,
			DEBUG: "app:federation:*,app:api:federation:*",
			DEBUG_COLORS: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	for (const stream of [proc.stdout, proc.stderr]) {
		(async () => {
			for await (const chunk of stream as ReadableStream<Uint8Array>) {
				writer.write(chunk);
				writer.flush();
			}
		})();
	}
	procs[id] = proc;
	await waitUp(id);
}

async function stopNode(id: NodeId) {
	const proc = procs[id];
	if (!proc) return;
	proc.kill();
	await proc.exited;
	delete procs[id];
}

function setRules(id: NodeId, rules: { dns?: NodeId[]; refuse?: NodeId[]; timeout?: NodeId[] }) {
	writeFileSync(
		`${NETSIM_DIR}/${id}.json`,
		JSON.stringify({
			dns: (rules.dns ?? []).map(host),
			refuse: (rules.refuse ?? []).map(host),
			timeout: (rules.timeout ?? []).map(host),
		}),
	);
}

function clearRules() {
	for (const id of NODE_IDS) setRules(id, {});
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

const pools: Record<NodeId, Pool> = {} as never;
for (const id of NODE_IDS) pools[id] = new Pool({ connectionString: envs[id].DATABASE_URL });

async function q<T = Record<string, unknown>>(id: NodeId, sql: string, params: unknown[] = []): Promise<T[]> {
	return (await pools[id].query(sql, params)).rows as T[];
}

async function registryRow(on: NodeId, peer: NodeId) {
	const [row] = await q<{ is_healthy: boolean; unhealthy_reason: string | null }>(
		on,
		"select is_healthy, unhealthy_reason from server_registry where url = $1",
		[url(peer)],
	);
	return row;
}

/** Forget health state on every node so scenarios don't leak into each other. */
async function resetHealth() {
	for (const id of NODE_IDS) {
		await q(id, "update server_registry set is_healthy = true, unhealthy_reason = null, health_check_attempts = 0, last_seen = now()");
		await q(id, "delete from blacklisted_servers");
	}
}

/** Make `peer` the first proxy candidate on `on` (proxy selection orders by last_seen desc). */
async function preferProxy(on: NodeId, peer: NodeId) {
	await q(on, "update server_registry set last_seen = now() + interval '1 hour' where url = $1", [url(peer)]);
}

async function drainQueues() {
	for (const id of NODE_IDS) {
		const connection = new Redis(envs[id].REDIS_URL, { maxRetriesPerRequest: null });
		for (const name of ["federation-delivery", "federation-health-check"]) {
			const queue = new Queue(name, { connection: connection as never });
			await queue.obliterate({ force: true }).catch(() => { });
			await queue.close();
		}
		connection.disconnect();
		await q(id, "delete from delivery_jobs");
	}
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

type Verdict = "PASS" | "FAIL" | "INFO";
const results: { id: string; name: string; verdict: Verdict; detail: string }[] = [];

function record(id: string, name: string, verdict: Verdict, detail: string) {
	const icon = verdict === "PASS" ? "✔" : verdict === "FAIL" ? "✘" : "ℹ";
	console.log(`  ${icon} [${id}] ${name}\n      ${detail}`);
	results.push({ id, name, verdict, detail });
}

// ---------------------------------------------------------------------------
// Delivery probe
// ---------------------------------------------------------------------------

let alice: SipherTestUser;
let bob: SipherTestUser;

interface DeliveryOutcome {
	delivered: boolean;
	afterMs: number;
	postId: string;
	content: string;
	proxies: string[];
	stranded: boolean;
	aLog: string;
}

async function postAndWait(label: string, opts: { waitMs: number; during?: (elapsedMs: number) => Promise<void> }): Promise<DeliveryOutcome> {
	const content = `censorship-probe ${label} ${crypto.randomUUID()}`;
	const offset = logSize("a");
	const started = Date.now();
	const { postId, federationDeliveriesQueued } = await createPostOverHttp(alice, [{ type: "text", value: content }]);
	if (federationDeliveriesQueued < 1) throw new Error(`no federation deliveries queued for ${label}`);

	let delivered = false;
	const fired = new Set<number>();
	while (Date.now() - started < opts.waitMs) {
		const rows = await q(
			"c",
			"select id from posts where federation_post_id = $1 and federation_url = $2",
			[postId, url("a")],
		);
		if (rows.length > 0) {
			delivered = true;
			break;
		}
		if (opts.during) {
			const elapsed = Date.now() - started;
			const bucket = Math.floor(elapsed / 1000);
			if (!fired.has(bucket)) {
				fired.add(bucket);
				await opts.during(elapsed);
			}
		}
		await Bun.sleep(500);
	}
	const afterMs = Date.now() - started;
	const aLog = logSince("a", offset);
	const proxies = [...aLog.matchAll(/proxy route: sending through (\S+)/g)].map((m) => m[1]);
	return { delivered, afterMs, postId, content, proxies, stranded: aLog.includes("STRANDED"), aLog };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

console.log("── Starting nodes A, B, C, D ─────────────────────────────");
clearRules();
for (const id of NODE_IDS) await startNode(id);

console.log("── Mutual discovery (full mesh) ─────────────────────────");
for (const x of NODE_IDS) {
	for (const y of NODE_IDS) {
		if (x >= y) continue;
		const res = await fetch(`http://localhost:${PORTS[x]}/api/dev/relay-discover`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ target: url(y) }),
		});
		if (!res.ok) throw new Error(`discovery ${x} → ${y} failed: ${res.status} ${await res.text()}`);
	}
}
console.log("  12 registrations done");

alice = await createSipherUser(url("a"), { emailPrefix: "alice-cens", usernamePrefix: "alice_cs" });
bob = await createSipherUser(url("c"), { emailPrefix: "bob-cens", usernamePrefix: "bob_cs" });
// Mutual follow so A's createPost queues a delivery to C (see createPost's follower/following check).
await q("a", `insert into follows (id, follower_id, following_id, accepted, created_at, follower_server_url, following_server_url, acknowledged)
	values ($1, $2, $3, true, now(), $4, null, true), ($5, $3, $2, true, now(), null, $4, true)`,
	[crypto.randomUUID(), bob.userId, alice.userId, url("c"), crypto.randomUUID()]);
console.log(`  Alice@A ${alice.userId} ⇄ Bob@C ${bob.userId}`);

const scenarios: { id: string; name: string; run: () => Promise<void> }[] = [];
const scenario = (id: string, name: string, run: () => Promise<void>) => scenarios.push({ id, name, run });

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

scenario("S1", "Baseline: no censorship, A delivers to C directly", async () => {
	const r = await postAndWait("S1", { waitMs: 30_000 });
	if (r.delivered && r.proxies.length === 0) record("S1", "baseline direct delivery", "PASS", `delivered in ${r.afterMs}ms, no proxy`);
	else record("S1", "baseline direct delivery", "FAIL", `delivered=${r.delivered} proxies=${r.proxies.join(",") || "none"}`);
});

scenario("S2", "DNS censorship A↛C: delivery goes through a proxy peer", async () => {
	setRules("a", { dns: ["c"] });
	const r = await postAndWait("S2", { waitMs: 60_000 });
	if (r.delivered && r.proxies.length > 0) record("S2", "DNS-censored target reached via proxy", "PASS", `delivered in ${r.afterMs}ms via ${r.proxies.at(-1)}`);
	else record("S2", "DNS-censored target reached via proxy", "FAIL", `delivered=${r.delivered} proxies=${r.proxies.join(",") || "none"}`);

	// Confidentiality: the relay must never see the post in plaintext.
	const leaked = (["b", "d"] as NodeId[]).filter((p) => r.proxies.includes(url(p)) && readFileSync(logPath(p), "utf8").includes(r.content));
	const stored = [];
	for (const p of ["b", "d"] as NodeId[]) {
		const rows = await q(p, "select id from posts where content::text like $1", [`%${r.content}%`]);
		if (rows.length > 0) stored.push(p);
	}
	if (leaked.length === 0 && stored.length === 0) record("S2b", "proxy never sees plaintext", "PASS", "post text absent from proxy logs and proxy databases");
	else record("S2b", "proxy never sees plaintext", "FAIL", `leaked in logs of ${leaked.join(",")}; stored on ${stored.join(",")}`);

	// After the block is lifted, does A ever trust C as a healthy peer (and proxy) again?
	clearRules();
	const r2 = await postAndWait("S2c", { waitMs: 30_000 });
	const row = await registryRow("a", "c");
	if (r2.delivered && row?.is_healthy) record("S2c", "C recovers as healthy on A after censorship ends", "PASS", `direct delivery ok, is_healthy=true`);
	else record("S2c", "C recovers as healthy on A after censorship ends", "FAIL",
		`direct delivery ${r2.delivered ? "ok" : "failed"}, but A still has C as is_healthy=${row?.is_healthy} (${row?.unhealthy_reason}); ` +
		`C is excluded from proxy selection until something marks it healthy again`);
});

scenario("S3", "DNS censorship A↛C and the preferred proxy B is down: falls over to D", async () => {
	setRules("a", { dns: ["c"] });
	await preferProxy("a", "b");
	await stopNode("b");
	try {
		const r = await postAndWait("S3", { waitMs: 90_000 });
		const tried = [...new Set(r.proxies)].join(" → ") || "none";
		if (r.delivered) record("S3", "dead proxy is skipped for a live one", "PASS", `delivered in ${r.afterMs}ms; proxies tried: ${tried}`);
		else record("S3", "dead proxy is skipped for a live one", "FAIL", `not delivered in 90s; proxies tried: ${tried} (${r.proxies.length} attempts)`);
	} finally {
		await startNode("b");
	}
});

scenario("S4", "C is censored for A and for the preferred proxy B: falls over to D", async () => {
	setRules("a", { dns: ["c"] });
	setRules("b", { dns: ["c"] });
	await preferProxy("a", "b");
	const r = await postAndWait("S4", { waitMs: 90_000 });
	const tried = [...new Set(r.proxies)].join(" → ") || "none";
	if (r.delivered) record("S4", "proxy that cannot reach target is skipped", "PASS", `delivered in ${r.afterMs}ms; proxies tried: ${tried}`);
	else record("S4", "proxy that cannot reach target is skipped", "FAIL", `not delivered in 90s; proxies tried: ${tried} (${r.proxies.length} attempts)`);
});

scenario("S5", "A is blacklisted-proxy aware: a proxy A blacklisted is never used", async () => {
	setRules("a", { dns: ["c"] });
	await preferProxy("a", "b");
	await q("a", "insert into blacklisted_servers (id, server_url, created_at, reason) values ($1, $2, now(), 'test')", [crypto.randomUUID(), url("b")]);
	const r = await postAndWait("S5", { waitMs: 60_000 });
	const usedB = r.proxies.includes(url("b"));
	if (r.delivered && !usedB) record("S5", "blacklisted peer not used as proxy", "PASS", `delivered via ${r.proxies.at(-1)}`);
	else record("S5", "blacklisted peer not used as proxy", "FAIL", `delivered=${r.delivered}; proxies tried: ${[...new Set(r.proxies)].join(" → ") || "none"}`);
});

scenario("S6", "A fully isolated (all peers DNS-blocked), then the block lifts", async () => {
	setRules("a", { dns: ["b", "c", "d"] });
	const r = await postAndWait("S6", {
		waitMs: 120_000,
		during: async (elapsed) => {
			if (elapsed > 25_000) clearRules();
		},
	});
	if (r.delivered) record("S6", "queued post survives total isolation and is delivered after", "PASS", `delivered ${r.afterMs}ms after posting (block lifted at ~25s); STRANDED logged=${r.stranded}`);
	else record("S6", "queued post survives total isolation and is delivered after", "FAIL", `not delivered within 120s; STRANDED logged=${r.stranded}`);
});

scenario("S7", "Target C goes down, then comes back", async () => {
	await stopNode("c");
	let restarted = false;
	const r = await postAndWait("S7", {
		waitMs: 120_000,
		during: async (elapsed) => {
			if (!restarted && elapsed > 20_000) {
				restarted = true;
				await startNode("c");
			}
		},
	});
	if (!restarted) await startNode("c");
	if (r.delivered && r.proxies.length === 0) record("S7", "delivery retried until target is back (no pointless proxying)", "PASS", `delivered ${r.afterMs}ms after posting (C restarted at ~20s)`);
	else if (r.delivered) record("S7", "delivery retried until target is back (no pointless proxying)", "INFO", `delivered after ${r.afterMs}ms but proxies were tried: ${r.proxies.join(",")}`);
	else record("S7", "delivery retried until target is back (no pointless proxying)", "FAIL", `not delivered within 120s`);
});

scenario("S8", "Silent-drop censorship (requests to C hang)", async () => {
	setRules("a", { timeout: ["c"] });
	const r = await postAndWait("S8", { waitMs: 60_000 });
	if (r.delivered) record("S8", "timeout-style censorship", "PASS", `delivered in ${r.afterMs}ms via ${r.proxies.at(-1) ?? "direct"}`);
	else record("S8", "timeout-style censorship", "FAIL",
		`not delivered in 60s; proxies tried: ${r.proxies.length}. TIMEOUT is not proxy-eligible in the default threat model, so a censor that drops packets instead of poisoning DNS blocks delivery`);
});

scenario("S9", "Connection-reset censorship (RST injection to C)", async () => {
	setRules("a", { refuse: ["c"] });
	const r = await postAndWait("S9", { waitMs: 60_000 });
	if (r.delivered) record("S9", "refused/reset-style censorship", "PASS", `delivered in ${r.afterMs}ms via ${r.proxies.at(-1) ?? "direct"}`);
	else record("S9", "refused/reset-style censorship", "FAIL",
		`not delivered in 60s; proxies tried: ${r.proxies.length}. CONN_REFUSED/CONN_RESET are treated as "server down", so a censor that resets connections blocks delivery`);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
	for (const s of scenarios) {
		if (only && !only.has(s.id)) continue;
		console.log(`\n── ${s.id}: ${s.name}`);
		clearRules();
		await drainQueues();
		await resetHealth();
		try {
			await s.run();
		} catch (err) {
			record(s.id, s.name, "FAIL", `scenario crashed: ${err instanceof Error ? err.message : err}`);
		}
		clearRules();
		for (const id of NODE_IDS) if (!procs[id]) await startNode(id);
	}
} finally {
	for (const id of NODE_IDS) await stopNode(id);
	for (const id of NODE_IDS) await pools[id].end();
}

console.log("\n════════════════════════════════════════════════════════");
for (const r of results) console.log(`${r.verdict.padEnd(4)} ${r.id.padEnd(4)} ${r.name}`);
const failed = results.filter((r) => r.verdict === "FAIL").length;
console.log(`\n${results.length - failed} ok, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
