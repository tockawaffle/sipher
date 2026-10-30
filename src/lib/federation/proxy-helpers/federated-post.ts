import db from "@/lib/db";
import { posts, remoteIdentityKeys } from "@/lib/db/schema";
import { base58_to_binary, getOwnSigningSecretKey, signMessage, verifySignature } from "@/lib/federation/keytools";
import { canonicalPostBytes } from "@/lib/identity/postSignature";
import { PostEnvelopeSchema } from "@/lib/zod/methods/PostFederationSchema";
import { and, eq } from "drizzle-orm";
import nacl from "tweetnacl";
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

	// The post's origin must be the server that signed it. Otherwise one server
	// could store posts, and pin author keys, in another server's name.
	if (envelope.federationUrl !== sender.url) {
		return {
			ok: false,
			error: "The post's federationUrl does not match the sending server.",
			code: "FEDERATION_URL_MISMATCH",
			status: 403,
		};
	}

	const authorCheck = await verifyAuthor(tx, envelope);
	if (!authorCheck.ok) return authorCheck;

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

/**
 * Checks the author's own signature over the post, then pins the author's
 * identity key. The sending server vouches for the key the first time; after
 * that, a post signed with any other key is refused, so a server cannot forge
 * posts for one of its users by swapping in a key of its own.
 *
 * Identity keys are derived from the user's mnemonic and are meant to stay the
 * same for life, so a changed key means a forged post or a reset identity.
 * There is no rotation flow for user keys yet.
 */
async function verifyAuthor(
	tx: Tx,
	envelope: z.infer<typeof PostEnvelopeSchema>,
): Promise<{ ok: true } | { ok: false; error: string; code: string; status: number }> {
	const { post, federationUrl } = envelope;

	let valid = false;
	try {
		const message = canonicalPostBytes({
			postId: post.id,
			authorId: post.authorId,
			publishedAt: post.published,
			content: post.content,
			federationUrl,
		});
		valid = nacl.sign.detached.verify(
			message,
			Uint8Array.from(Buffer.from(post.authorSignature, "base64")),
			base58_to_binary(post.authorSigningPublicKey),
		);
	} catch {
		valid = false;
	}
	if (!valid) {
		return {
			ok: false,
			error: "The post's author signature does not match its content.",
			code: "INVALID_AUTHOR_SIGNATURE",
			status: 403,
		};
	}

	const now = new Date();
	await tx
		.insert(remoteIdentityKeys)
		.values({
			id: crypto.randomUUID(),
			federationUrl,
			remoteUserId: post.authorId,
			signingPublicKey: post.authorSigningPublicKey,
			firstSeenAt: now,
			lastSeenAt: now,
		})
		.onConflictDoNothing({ target: [remoteIdentityKeys.federationUrl, remoteIdentityKeys.remoteUserId] });

	const [pinned] = await tx
		.select({ id: remoteIdentityKeys.id, signingPublicKey: remoteIdentityKeys.signingPublicKey })
		.from(remoteIdentityKeys)
		.where(and(
			eq(remoteIdentityKeys.federationUrl, federationUrl),
			eq(remoteIdentityKeys.remoteUserId, post.authorId),
		))
		.limit(1);

	if (pinned!.signingPublicKey !== post.authorSigningPublicKey) {
		return {
			ok: false,
			error: "This author's identity key differs from the one first seen for them.",
			code: "AUTHOR_KEY_MISMATCH",
			status: 409,
		};
	}

	await tx.update(remoteIdentityKeys).set({ lastSeenAt: now }).where(eq(remoteIdentityKeys.id, pinned!.id));
	return { ok: true };
}
