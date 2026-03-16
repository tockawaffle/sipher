import createDebug from "debug";

const debug = createDebug("federation:url-guard");

const BLOCKED_HOSTNAMES = new Set([
	"localhost",
	"0.0.0.0",
	"[::1]",
	"[::0]",
	"metadata.google.internal",
	"metadata.goog",
	"169.254.169.254",
]);

const DEV_ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", process.env.DEV_ALLOWED_HOSTNAMES!]);
debug("DEV_ALLOWED_HOSTNAMES: %o", DEV_ALLOWED_HOSTNAMES);
function isPrivateIPv4(hostname: string): boolean {
	const parts = hostname.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

	const [a, b] = parts;
	if (a === 127) return true;                       // 127.0.0.0/8
	if (a === 10) return true;                        // 10.0.0.0/8
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 168) return true;           // 192.168.0.0/16
	if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local / AWS metadata)
	if (a === 0) return true;                          // 0.0.0.0/8

	return false;
}

function isPrivateIPv6(hostname: string): boolean {
	const bare = hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (bare === "::1" || bare === "::0" || bare === "::") return true;
	if (bare.startsWith("fc") || bare.startsWith("fd")) return true;  // ULA
	if (bare.startsWith("fe80")) return true;                          // link-local
	return false;
}

/**
 * Throws if the URL points to a private/internal address or uses a
 * non-HTTP(S) protocol. In development, localhost/127.0.0.1 are explicitly
 * allowed for local federation testing while all other safety checks
 * remain enforced.
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

	if (process.env.NODE_ENV === "development" && DEV_ALLOWED_HOSTNAMES.has(hostname)) {
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
