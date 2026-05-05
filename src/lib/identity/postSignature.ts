/**
 * Canonical bytes that the user's Ed25519 identity key signs when authoring
 * a post. The same builder is used by the client (to produce the signature)
 * and the server (to verify it), so any change here must ship to both sides
 * simultaneously — bump `v` to invalidate old signatures during a migration.
 *
 * V8 and JavaScriptCore both preserve string-key insertion order in
 * `JSON.stringify`, which makes this output deterministic across the
 * browsers and Node versions we care about.
 */
export interface PostSignaturePayload {
	postId: string;
	authorId: string;
	publishedAt: string;
	content: unknown;
}

export function canonicalPostBytes(payload: PostSignaturePayload): Uint8Array {
	const canonical = JSON.stringify({
		v: 1,
		postId: payload.postId,
		authorId: payload.authorId,
		publishedAt: payload.publishedAt,
		content: payload.content,
	});
	return new TextEncoder().encode(canonical);
}
