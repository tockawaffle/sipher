/**
 * Canonical byte builders for follow-related signatures.
 *
 * Both client (signer) and server (verifier) import these functions to
 * guarantee they operate on identical byte sequences
 *
 * The `federationUrl` field binds each signature to a specific server,
 * preventing cross-server replay.
 */

export interface FollowRequestPayload {
	followId: string;
	followerId: string;
	followingId: string;
	createdAt: string;
	/** The canonical URL of the server this follow request is being submitted to. */
	federationUrl: string;
}

export function canonicalFollowRequestBytes(payload: FollowRequestPayload): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			v: 2,
			followId: payload.followId,
			followerId: payload.followerId,
			followingId: payload.followingId,
			createdAt: payload.createdAt,
			federationUrl: payload.federationUrl,
		}),
	);
}

export interface FollowResponsePayload {
	followId: string;
	response: "accept" | "reject";
	timestamp: string;
	/** The canonical URL of the server this response is submitted to. */
	federationUrl: string;
}

export function canonicalFollowResponseBytes(payload: FollowResponsePayload): Uint8Array {
	return new TextEncoder().encode(
		JSON.stringify({
			v: 2,
			followId: payload.followId,
			response: payload.response,
			timestamp: payload.timestamp,
			federationUrl: payload.federationUrl,
		}),
	);
}
