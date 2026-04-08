import createDebug from "debug";
import { z } from "zod";

const debug = createDebug("app:federation:url-guard");

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"0.0.0.0",
	"[::1]",
	"[::0]",
	"metadata.google.internal",
	"metadata.goog",
	"169.254.169.254",
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

const DEV_ALLOWED_HOSTNAMES = new Set([
	"localhost",
	"127.0.0.1",
]);

if (typeof process.env.DEV_ALLOWED_HOSTNAMES === "string" && process.env.DEV_ALLOWED_HOSTNAMES.trim() !== "") {
	for (const h of process.env.DEV_ALLOWED_HOSTNAMES.split(",")) {
		const hostname = allowlistHostname(h);
		if (hostname) DEV_ALLOWED_HOSTNAMES.add(hostname);
	}
}

debug("DEV_ALLOWED_HOSTNAMES: %s", [...DEV_ALLOWED_HOSTNAMES].join(", "));

const ipv4Octet = z.number().int().min(0).max(255);
const ipv4OctetsSchema = z
	.ipv4()
	.transform((s) => s.split(".").map((octet) => Number.parseInt(octet, 10)))
	.pipe(z.tuple([ipv4Octet, ipv4Octet, ipv4Octet, ipv4Octet]));

function isPrivateIPv4(hostname: string): boolean {
	const parsed = ipv4OctetsSchema.safeParse(hostname);
	if (!parsed.success) return false;

	const [a, b] = parsed.data;
	if (a === 127) return true;                       // 127.0.0.0/8
	if (a === 10) return true;                        // 10.0.0.0/8
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 168) return true;           // 192.168.0.0/16
	if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local / AWS metadata)
	if (a === 0) return true;                          // 0.0.0.0/8

	return false;
}

const ipv6HostNormalized = z
	.string()
	.transform((h) => h.replace(/^\[|\]$/g, "").toLowerCase())
	.pipe(z.ipv6());

const ipv6Hextet16 = z
	.string()
	.regex(/^[0-9a-f]{1,4}$/)
	.transform((s) => Number.parseInt(s, 16))
	.pipe(z.number().int().min(0).max(0xffff));

/** First 16-bit group, or null if address starts with `::` (no leading hextet) / not colon-shaped. */
function ipv6LeadingHextet(bare: string): string | null {
	if (bare.startsWith("::")) return null;
	const colon = bare.indexOf(":");
	if (colon === -1) return null;
	return bare.slice(0, colon);
}

function isPrivateIPv6(hostname: string): boolean {
	const host = ipv6HostNormalized.safeParse(hostname);
	if (!host.success) return false;

	const bare = host.data;
	if (bare === "::1" || bare === "::0" || bare === "::") return true;

	const first = ipv6LeadingHextet(bare);
	if (first === null) return false;

	const hextet = ipv6Hextet16.safeParse(first);
	if (!hextet.success) return false;

	const n = hextet.data;
	return (n >= 0xfc00 && n <= 0xfdff) || (n >= 0xfe80 && n <= 0xfebf); // ULA fc00::/7, link-local fe80::/10
}

/**
 * Throws if the URL points to a private/internal address or uses a
 * non-HTTP(S) protocol. Hosts listed in `DEV_ALLOWED_HOSTNAMES` are always allowed
 * (use bare host or `host:port` / full URL — port is stripped to match `URL.hostname`).
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

	if (isPrivateIPv4(hostname)) {
		debug("blocked private IPv4: %s", hostname);
		throw new UrlGuardError(`Blocked internal address: ${hostname}`);
	}

	if (hostname.startsWith("[") || isPrivateIPv6(hostname)) {
		if (isPrivateIPv6(hostname)) {
			debug("blocked private IPv6: %s", hostname);
			throw new UrlGuardError(`Blocked internal address: ${hostname}`);
		}
	}
}

export class UrlGuardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UrlGuardError";
	}
}
