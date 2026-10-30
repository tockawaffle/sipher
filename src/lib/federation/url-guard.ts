import createDebug from "debug";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const debug = createDebug("app:federation:url-guard");

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"metadata.google.internal",
	"metadata.goog",
]);

/** Normalize allowlist tokens so `host:port` and full URLs map to URL.hostname. */
function allowlistHostname(entry: string): string | null {
	const t = entry.trim();
	if (!t) return null;
	try {
		if (t.includes("://")) return new URL(t).hostname;
		return new URL(`http://${t}`).hostname;
	} catch {
		return t;
	}
}

// localhost is only allowed outside production. A production server must
// list any internal host it federates with explicitly.
const DEV_ALLOWED_HOSTNAMES = new Set(
	process.env.NODE_ENV === "production" ? [] : ["localhost", "127.0.0.1"],
);

if (typeof process.env.DEV_ALLOWED_HOSTNAMES === "string" && process.env.DEV_ALLOWED_HOSTNAMES.trim() !== "") {
	for (const h of process.env.DEV_ALLOWED_HOSTNAMES.split(",")) {
		const hostname = allowlistHostname(h);
		if (hostname) DEV_ALLOWED_HOSTNAMES.add(hostname);
	}
}

debug("DEV_ALLOWED_HOSTNAMES: %s", [...DEV_ALLOWED_HOSTNAMES].join(", "));

/**
 * Addresses a federation request must never reach. `BlockList` also matches
 * IPv4-mapped IPv6 (`::ffff:127.0.0.1`) against the IPv4 rules.
 */
const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
	["0.0.0.0", 8],        // "this" network
	["10.0.0.0", 8],       // private
	["100.64.0.0", 10],    // carrier-grade NAT
	["127.0.0.0", 8],      // loopback
	["169.254.0.0", 16],   // link-local / cloud metadata
	["172.16.0.0", 12],    // private
	["192.0.0.0", 24],     // IETF protocol assignments
	["192.168.0.0", 16],   // private
	["198.18.0.0", 15],    // benchmarking
	["224.0.0.0", 4],      // multicast
	["240.0.0.0", 4],      // reserved and broadcast
] as const) {
	BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
	["::", 128],           // unspecified
	["::1", 128],          // loopback
	["64:ff9b::", 96],     // NAT64, embeds an IPv4 address
	["fc00::", 7],         // unique local
	["fe80::", 10],        // link-local
	["ff00::", 8],         // multicast
] as const) {
	BLOCKED_ADDRESSES.addSubnet(network, prefix, "ipv6");
}

function stripBrackets(hostname: string): string {
	return hostname.replace(/^\[|\]$/g, "");
}

function isBlockedAddress(address: string): boolean {
	const bare = stripBrackets(address);
	const family = isIP(bare);
	if (family === 0) return false;
	return BLOCKED_ADDRESSES.check(bare, family === 6 ? "ipv6" : "ipv4");
}

/**
 * Throws if the URL points to a private/internal address or uses a
 * non-HTTP(S) protocol. Hosts listed in `DEV_ALLOWED_HOSTNAMES` are always allowed
 * (use bare host or `host:port` / full URL — port is stripped to match `URL.hostname`).
 *
 * This only looks at the URL. Use `assertSafeAddress` before a request so a
 * public name that resolves to an internal address is refused too.
 */
export function assertSafeUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new UrlGuardError(`Invalid URL: ${url}`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new UrlGuardError(`Blocked protocol: ${parsed.protocol}`);
	}

	const hostname = parsed.hostname;

	// Explicit dev allowlist wins (host-only match; list entries may use host:port — see allowlistHostname).
	if (DEV_ALLOWED_HOSTNAMES.has(hostname)) {
		return;
	}

	if (BLOCKED_HOSTNAMES.has(hostname)) {
		debug("blocked hostname: %s", hostname);
		throw new UrlGuardError(`Blocked internal address: ${hostname}`);
	}

	if (isBlockedAddress(hostname)) {
		debug("blocked internal address: %s", hostname);
		throw new UrlGuardError(`Blocked internal address: ${hostname}`);
	}
}

/**
 * `assertSafeUrl` plus a DNS check: resolves the hostname and throws
 * `UrlGuardError` if any address it resolves to is internal. Lookup failures
 * are rethrown as is, so callers can treat them as DNS blocking.
 *
 * The check and the later fetch resolve separately, so a DNS server that
 * answers differently each time (rebinding) can still slip through.
 */
export async function assertSafeAddress(url: string): Promise<void> {
	assertSafeUrl(url);

	const hostname = new URL(url).hostname;
	if (DEV_ALLOWED_HOSTNAMES.has(hostname) || isIP(stripBrackets(hostname)) !== 0) return;

	const addresses = await lookup(hostname, { all: true });
	for (const { address } of addresses) {
		if (isBlockedAddress(address)) {
			debug("blocked %s: resolves to internal address %s", hostname, address);
			throw new UrlGuardError(`Blocked internal address: ${hostname} resolves to ${address}`);
		}
	}
}

export class UrlGuardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UrlGuardError";
	}
}
