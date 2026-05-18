/**
 * Canonical bytes that the user's Ed25519 identity key signs when authoring
 * a post. The same builder is used by the client (to produce the signature)
 * and the server (to verify it), so any change here must ship to both sides
 * simultaneously — bump `v` to invalidate old signatures during a migration.
 *
 * Object keys inside `content` are sorted alphabetically before stringification
 * so that the canonical form is independent of insertion order. This matters
 * because Zod rebuilds parsed objects in schema-definition key order, which
 * differs from the order the client constructs content blocks.
 *
 * The `federationUrl` field binds the signature to a specific server,
 * making cross-server signature replay infeasible.
 */
export interface PostSignaturePayload {
	postId: string;
	authorId: string;
	publishedAt: string;
	content: unknown;
	/** The canonical URL of the server this post is being submitted to. */
	federationUrl: string;
}

function sortedReplacer(_key: string, value: unknown): unknown {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
				a < b ? -1 : a > b ? 1 : 0,
			),
		);
	}
	return value;
}

export function canonicalPostBytes(payload: PostSignaturePayload): Uint8Array {
	const canonical = JSON.stringify(
		{
			v: 2,
			postId: payload.postId,
			authorId: payload.authorId,
			publishedAt: payload.publishedAt,
			content: payload.content,
			federationUrl: payload.federationUrl,
		},
		sortedReplacer,
	);
	return new TextEncoder().encode(canonical);
}
