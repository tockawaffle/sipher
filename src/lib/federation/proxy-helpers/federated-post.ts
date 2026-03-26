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

	if (existing) {
		return {
			ok: false,
			error: "This post has already been federated to this server.",
			code: "FEDERATED_POST_ALREADY_EXISTS",
			status: 409,
		};
	}

	const localId = crypto.randomUUID();
	const published = new Date(envelope.post.published);

	await tx.insert(posts).values({
		id: localId,
		content: envelope.post.content,
		authorId: null,
		federatedAuthorId: envelope.post.authorId,
		published,
		isLocal: false,
		isPrivate: envelope.post.isPrivate,
		federationUrl: envelope.federationUrl,
		federationPostId: envelope.post.id,
		createdAt: new Date(),
	});

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
