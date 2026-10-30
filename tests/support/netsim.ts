/**
 * Network simulator preload for censorship tests.
 *
 * Loaded with `bun --preload tests/support/netsim.ts src/server.ts`. It wraps
 * the global `fetch` of one SiPher node so tests can make that node's view of
 * the network hostile without touching the application code:
 *
 *   - `dns`:     hostnames that fail as if DNS were censored (ENOTFOUND)
 *   - `refuse`:  hostnames that fail as if the host were down (ECONNREFUSED)
 *   - `timeout`: hostnames whose requests hang until the caller's abort signal fires
 *   - `slow`:    hostnames whose requests reach the server, but whose responses
 *                are dropped, so the caller times out after the server acted
 *
 * Rules are read from `$SIPHER_NETSIM_DIR/$SIPHER_NODE.json` on every request,
 * so a test can change them while the node keeps running.
 *
 * Requests to api.pwnedpasswords.com are answered locally with an empty range
 * so the haveIBeenPwned plugin works in sandboxes without internet access.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface NetRules {
	dns?: string[];
	refuse?: string[];
	timeout?: string[];
	slow?: string[];
}

const node = process.env.SIPHER_NODE;
const dir = process.env.SIPHER_NETSIM_DIR ?? "/tmp/sipher-netsim";
const realFetch = globalThis.fetch;

function readRules(): NetRules {
	if (!node) return {};
	const file = join(dir, `${node}.json`);
	if (!existsSync(file)) return {};
	try {
		return JSON.parse(readFileSync(file, "utf8")) as NetRules;
	} catch {
		return {};
	}
}

function networkError(code: string, host: string): Error {
	const cause = Object.assign(new Error(`${code} ${host}`), { code });
	return Object.assign(new TypeError("fetch failed"), { cause });
}

const simulatedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(input instanceof Request ? input.url : input.toString());
	const host = url.hostname;

	if (host === "api.pwnedpasswords.com") {
		return new Response("", { status: 200 });
	}

	const rules = readRules();
	if (rules.dns?.includes(host)) throw networkError("ENOTFOUND", host);
	if (rules.refuse?.includes(host)) throw networkError("ECONNREFUSED", host);
	const hangUntilAbort = () => {
		const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
		return new Promise<Response>((_, reject) => {
			signal?.addEventListener("abort", () => {
				reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" }));
			});
		});
	};

	if (rules.timeout?.includes(host)) return await hangUntilAbort();
	if (rules.slow?.includes(host)) {
		// Deliver the request without the caller's signal so it completes, then drop the answer.
		const { signal: _signal, ...rest } = init ?? {};
		await realFetch(input, rest).then((res) => res.arrayBuffer()).catch(() => undefined);
		return await hangUntilAbort();
	}

	return realFetch(input, init);
}) as typeof fetch;

globalThis.fetch = Object.assign(simulatedFetch, { preconnect: realFetch.preconnect });
