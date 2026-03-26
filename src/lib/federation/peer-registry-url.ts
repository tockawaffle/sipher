/**
 * Values for `follows.follower_server_url` / `follows.following_server_url`, which FK to
 * `server_registry.url`. This instance is intentionally absent from that table, so when the
 * peer is local we persist null instead of violating the FK.
 */
export function peerRegistryUrlOrNull(peerUrl: string | null | undefined): string | null {
	if (peerUrl == null || peerUrl === "") return null;
	const own = process.env.BETTER_AUTH_URL;
	let peerOrigin: string;
	try {
		peerOrigin = new URL(peerUrl).origin;
	} catch {
		return null;
	}
	if (!own) return peerOrigin;
	const ownOrigin = new URL(own).origin;
	if (peerOrigin === ownOrigin) return null;
	return peerOrigin;
}
