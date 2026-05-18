import { getFederationQueue, type FederationDeliveryJob } from "@/lib/bull";
import db from "@/lib/db";
import { deliveryJobs, follows, posts, serverRegistry, userIdentityKeys } from "@/lib/db/schema";
import { base58_to_binary, encryptPayload } from "@/lib/federation/keytools";
import { applyFederatedPostInTransaction } from "@/lib/federation/proxy-helpers/federated-post";
import { canonicalPostBytes } from "@/lib/identity/postSignature";
import minioClient from "@/lib/plugins/storage/server/minio.client";
import { EncryptedEnvelopeBaseSchema } from "@/lib/zod/EncryptedEnvelope";
import { PostEnvelopeSchema } from "@/lib/zod/methods/PostFederationSchema";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import createDebug from "debug";
import { and, eq } from "drizzle-orm";
import nacl from "tweetnacl";
import { z } from "zod";
import { postContentSchema } from "../social";

const debug = createDebug("app:plugins:server:helpers:social:posts");

const federatedPostRequestSchema = z.object({
	method: z.literal("FEDERATE_POST"),
	payload: EncryptedEnvelopeBaseSchema,
	signature: z.string(),
});

const userPostRequestSchema = z.object({
	postId: z.uuidv4(),
	publishedAt: z.iso.datetime(),
	signature: z.string().min(1),
	content: postContentSchema,
});

const createPostBodySchema = z.union([federatedPostRequestSchema, userPostRequestSchema]);

export const createPost = createAuthEndpoint("/social/posts", {
	method: "POST",
	body: createPostBodySchema,
}, async (context) => {
	const body = context.body;

	if ("method" in body) {
		const { payload: encryptedPayload, signature } = body;

		const parsedEnvelope = PostEnvelopeSchema.safeParse(encryptedPayload);
		if (!parsedEnvelope.success) {
			return context.json(
				{ error: "Invalid federated post payload", code: "INVALID_FEDERATED_POST_PAYLOAD" },
				{ status: 400 },
			);
		}

		const envelope = parsedEnvelope.data;
		const [server] = await db
			.select({
				url: serverRegistry.url,
				publicKey: serverRegistry.publicKey,
				encryptionPublicKey: serverRegistry.encryptionPublicKey,
			})
			.from(serverRegistry)
			.where(eq(serverRegistry.url, envelope.federationUrl))
			.limit(1);

		if (!server) {
			return context.json(
				{
					error: "Unknown federation server. Please redo the discovery process and try again.",
					code: "UNKNOWN_FEDERATION_SERVER_INTERACTION",
				},
				{ status: 403 },
			);
		}

		const result = await db.transaction(async (tx) =>
			applyFederatedPostInTransaction(tx, envelope, signature, server),
		);

		if (!result.ok) {
			return context.json({ error: result.error, code: result.code }, { status: result.status });
		}

		const recipientKey = new Uint8Array(Buffer.from(result.senderEncryptionPublicKeyB64, "base64"));
		return context.json(
			{
				method: "PROXY_RESPONSE" as const,
				status: "acknowledged",
				data: encryptPayload(result.innerPayload, recipientKey),
				signature: result.signature,
			},
			{ status: 200 },
		);
	}

	const { postId, publishedAt, signature, content } = body;
	const user = await getSessionFromCtx(context);

	if (!user) {
		return context.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Verify the post against the user's registered identity key. Without a
	// matching identity row the user cannot author posts — they must complete
	// the identity-creation flow first.
	const [identity] = await db
		.select({ signingPublicKey: userIdentityKeys.signingPublicKey })
		.from(userIdentityKeys)
		.where(eq(userIdentityKeys.userId, user.user.id))
		.limit(1);

	if (!identity) {
		return context.json(
			{ error: "No identity registered for this user", code: "IDENTITY_NOT_REGISTERED" },
			{ status: 412 },
		);
	}

	let signatureValid = false;
	try {
		const publicKey = base58_to_binary(identity.signingPublicKey);
		const signatureBytes = Uint8Array.from(Buffer.from(signature, "base64"));
		const message = canonicalPostBytes({ postId, authorId: user.user.id, publishedAt, content, federationUrl: process.env.BETTER_AUTH_URL! });
		signatureValid = nacl.sign.detached.verify(message, signatureBytes, publicKey);
	} catch (err) {
		debug("signature verification threw: %o", err);
	}

	if (!signatureValid) {
		return context.json(
			{ error: "Invalid post signature", code: "INVALID_POST_SIGNATURE" },
			{ status: 400 },
		);
	}

	const isPrivate = user.user.isPrivate;
	const policy = user.user.postPropagationPolicy as "all" | "followers" | "none";
	const shouldFederate = policy !== "none";

	const published = new Date(publishedAt);
	const inserted = await db
		.insert(posts)
		.values({
			id: postId,
			content,
			authorId: user.user.id,
			published,
			isLocal: true,
			isPrivate,
			federationUrl: process.env.BETTER_AUTH_URL!,
			federationPostId: postId,
			createdAt: new Date(),
			authorSignature: signature,
		})
		.returning({ id: posts.id });

	let federationDeliveriesQueued = 0;

	if (shouldFederate) {
		const followers = await db
			.select()
			.from(follows)
			.where(and(eq(follows.followingId, user.user.id), eq(follows.accepted, true)));
		const following = await db
			.select()
			.from(follows)
			.where(and(eq(follows.followerId, user.user.id), eq(follows.accepted, true)));

		debug("followers: %o", followers);
		debug("following: %o", following);

		if (followers.length === 0 || following.length === 0) {
			debug("User has no followers and does not follow anyone, skipping federation");
			return context.json(
				{ id: inserted[0].id, federationDeliveriesQueued: 0 },
				{ status: 200 },
			);
		}

		const uniqueUrls = [
			...new Set([
				...followers.map((f) => f.followerServerUrl).filter(Boolean),
				...following.map((f) => f.followingServerUrl).filter(Boolean),
			]),
		] as string[];

		federationDeliveriesQueued = uniqueUrls.length;

		if (uniqueUrls.length > 0) {
			const jobPayload = JSON.stringify({
				method: "FEDERATE_POST" as const,
				federationUrl: process.env.BETTER_AUTH_URL!,
				post: {
					id: postId,
					content,
					authorId: user.user.id,
					published: published.toISOString(),
					isPrivate,
				},
			});

			const jobRows = uniqueUrls.map((url) => ({
				id: crypto.randomUUID(),
				targetUrl: url + "/api/auth/social/posts",
				payload: jobPayload,
				attempts: 0,
				createdAt: new Date(),
			}));

			await db.insert(deliveryJobs).values(jobRows);

			await getFederationQueue().addBulk(
				jobRows.map((row) => ({
					name: "deliver-post" as const,
					data: {
						deliveryJobId: row.id,
						targetUrl: row.targetUrl,
						serverUrl: new URL(row.targetUrl).origin,
						payload: row.payload,
					} satisfies FederationDeliveryJob,
				})),
			);
		}
	}

	return context.json(
		{ id: inserted[0].id, federationDeliveriesQueued },
		{ status: 200 },
	);
});

export const getPost = createAuthEndpoint("/social/posts/:id", {
	method: "GET",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => { });

const ALLOWED_MIME_TYPES = [
	"image/jpeg", "image/png", "image/gif", "image/webp",
	"video/mp4", "video/webm",
	"audio/mpeg", "audio/ogg", "audio/wav",
];

const PRESIGN_EXPIRY_SECONDS = 5 * 60;

export const uploadFile = createAuthEndpoint("/social/posts/files", {
	method: "POST",
	body: z.object({
		fileName: z.string().min(1),
		mimeType: z.string().refine((v) => ALLOWED_MIME_TYPES.includes(v), {
			message: "Unsupported file type",
		}),
		size: z.number().positive(),
	}),
}, async (context) => {
	const user = await getSessionFromCtx(context);

	if (!user) {
		return context.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { fileName, mimeType, size } = context.body;
	const ext = fileName.split(".").pop() ?? "bin";
	const objectKey = `tmp/${user.user.id}/${crypto.randomUUID()}.${ext}`;

	const presignedUrl = await minioClient.presignedPutObject(
		process.env.MINIO_BUCKET!,
		objectKey,
		PRESIGN_EXPIRY_SECONDS,
	);

	// Use a presigned GET URL (1-year expiry) instead of a permanent direct object URL.
	// This avoids leaking the MinIO origin/credentials to federation peers and preserves
	// the ability to revoke access by invalidating the key.
	const GET_EXPIRY_SECONDS = 365 * 24 * 60 * 60; // 1 year
	const objectUrl = await minioClient.presignedGetObject(
		process.env.MINIO_BUCKET!,
		objectKey,
		GET_EXPIRY_SECONDS,
	);

	return context.json({ presignedUrl, objectUrl, objectKey }, { status: 200 });
});
