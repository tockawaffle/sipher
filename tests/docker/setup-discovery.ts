export {};

/**
 * Sets up mutual discovery between all three Sipher federation instances.
 *
 * Each instance must know about the others before integration tests can run.
 * This script performs the minimum calls to achieve a full mesh:
 *
 *   A → discover B  (A stores B, B stores A via REGISTER callback)
 *   A → discover C  (A stores C, C stores A)
 *   B → discover C  (B stores C, C stores B)
 *
 * It does this by issuing REGISTER requests to each server for each of the
 * other two, which is equivalent to what discoverAndRegister() does internally.
 *
 * Usage (from within the Docker network):
 *   docker compose -f tests/docker-compose.yml run --rm setup-discovery
 *   # or directly:
 *   docker compose -f tests/docker-compose.yml run --rm test-runner tests/docker/setup-discovery.ts
 *
 * URLs default to the three Docker service names but can be overridden:
 *   SIPHER_A_URL=http://sipher-a:3000 \
 *   SIPHER_B_URL=http://sipher-b:3001 \
 *   SIPHER_C_URL=http://sipher-c:3002 \
 *   docker compose -f tests/docker-compose.yml run --rm test-runner tests/docker/setup-discovery.ts
 */

const URLS = [
	process.env.SIPHER_A_URL ?? "http://sipher-a:3000",
	process.env.SIPHER_B_URL ?? "http://sipher-b:3001",
	process.env.SIPHER_C_URL ?? "http://sipher-c:3002",
];

const TIMEOUT_MS = 15_000;

interface DiscoverResponse {
	url: string;
	publicKey: string;
	encryptionPublicKey: string;
}

async function fetchInfo(url: string): Promise<DiscoverResponse> {
	const res = await fetch(`${url}/discover`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	if (!res.ok) throw new Error(`GET ${url}/discover returned ${res.status}`);
	const body = await res.json() as DiscoverResponse;
	if (!body.url || !body.publicKey || !body.encryptionPublicKey) {
		throw new Error(`${url}/discover returned incomplete keys`);
	}
	return body;
}

async function register(targetUrl: string, peer: DiscoverResponse) {
	const res = await fetch(`${targetUrl}/discover`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			method: "REGISTER",
			url: peer.url,
			publicKey: peer.publicKey,
			encryptionPublicKey: peer.encryptionPublicKey,
		}),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(`REGISTER ${peer.url} on ${targetUrl} failed (${res.status}): ${JSON.stringify(body)}`);
	}
	return body;
}

// ── Fetch all three instances ────────────────────────────────────────────────

console.log("Fetching instance keys…");
const infos = await Promise.all(URLS.map(fetchInfo));

for (const info of infos) {
	console.log(`  ${info.url}  signing=${info.publicKey.slice(0, 12)}…`);
}

// ── Register each instance with every other instance ────────────────────────
// 6 POST calls: for every ordered pair (A→B, A→C, B→A, B→C, C→A, C→B).
// When server X receives REGISTER from Y it fetches Y's /discover to validate,
// so each call also exercises the full handshake.

console.log("\nRegistering peers…");

let ok = 0;
let fail = 0;

for (let i = 0; i < infos.length; i++) {
	for (let j = 0; j < infos.length; j++) {
		if (i === j) continue;
		const target = URLS[i];
		const peer = infos[j];
		try {
			await register(target, peer);
			console.log(`  ✔  ${peer.url}  →  ${target}`);
			ok++;
		} catch (err) {
			console.error(`  ✘  ${peer.url}  →  ${target}: ${err instanceof Error ? err.message : err}`);
			fail++;
		}
	}
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${ok} registration(s) succeeded, ${fail} failed.`);

if (fail > 0) {
	console.error("Some registrations failed — check that all instances are healthy and reachable.");
	process.exit(1);
}

console.log("Mutual discovery complete. All instances know each other.");
