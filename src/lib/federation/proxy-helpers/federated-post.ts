import db from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { getOwnSigningSecretKey, signMessage, verifySignature } from "@/lib/federation/keytools";
import { PostEnvelopeSchema } from "@/lib/zod/methods/PostFederationSchema";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FederatedPostSender = {
	publicKey: string;
	encryptionPublicKey: string;
	url: string;
};

export type FederatedPostResult =
	| {
		ok: true;
		innerPayload: string;
		signature: string;
		senderEncryptionPublicKeyB64: string;
	}
	| { ok: false; error: string; code: string; status: number };

export async function applyFederatedPostInTransaction(
	tx: Tx,
	envelope: z.infer<typeof PostEnvelopeSchema>,
	bodySignature: string,
	sender: FederatedPostSender,
): Promise<FederatedPostResult> {
	const senderPublicKey = new Uint8Array(Buffer.from(sender.publicKey, "base64"));
	if (!verifySignature(envelope._raw, bodySignature, senderPublicKey)) {
		return {
			ok: false,
			error: "The provided signature is invalid. Please redo the discovery process and try again.",
			code: "INVALID_SIGNATURE",
			status: 403,
		};
	}

	const [existing] = await tx
		.select({ id: posts.id })
		.from(posts)
		.where(
			and(
				eq(posts.federationUrl, envelope.federationUrl),
				eq(posts.federationPostId, envelope.post.id),
			),
		)
		.limit(1);

	// A post can arrive twice: a direct attempt that timed out after we stored
	// it, then the same post through a proxy, or a replay. Acknowledge it again
	// with the id we already gave it, so the sender stops retrying.
	let localId = existing?.id;

	if (!localId) {
		localId = crypto.randomUUID();
		const inserted = await tx.insert(posts).values({
			id: localId,
			content: envelope.post.content,
			authorId: null,
			federatedAuthorId: envelope.post.authorId,
			published: new Date(envelope.post.published),
			isLocal: false,
			isPrivate: envelope.post.isPrivate,
			federationUrl: envelope.federationUrl,
			federationPostId: envelope.post.id,
			createdAt: new Date(),
			authorSignature: envelope.post.authorSignature,
		}).onConflictDoNothing({ target: [posts.federationUrl, posts.federationPostId] })
			.returning({ id: posts.id });

		if (inserted.length === 0) {
			// Lost a race with a concurrent copy of the same post.
			const [winner] = await tx
				.select({ id: posts.id })
				.from(posts)
				.where(and(
					eq(posts.federationUrl, envelope.federationUrl),
					eq(posts.federationPostId, envelope.post.id),
				))
				.limit(1);
			localId = winner!.id;
		}
	}

	const innerPayload = JSON.stringify({
		post: {
			id: localId,
			federationPostId: envelope.post.id,
		},
		federationUrl: process.env.BETTER_AUTH_URL!,
		method: "FEDERATE_POST" as const,
	});

	const signature = signMessage(innerPayload, getOwnSigningSecretKey());

	return {
		ok: true,
		innerPayload,
		signature,
		senderEncryptionPublicKeyB64: sender.encryptionPublicKey,
	};
}
