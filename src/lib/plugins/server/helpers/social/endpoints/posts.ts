import { getFederationQueue, type FederationDeliveryJob } from "@/lib/bull";
import db from "@/lib/db";
import { deliveryJobs, follows, posts, serverRegistry } from "@/lib/db/schema";
import { encryptPayload } from "@/lib/federation/keytools";
import { applyFederatedPostInTransaction } from "@/lib/federation/proxy-helpers/federated-post";
import { EncryptedEnvelopeBaseSchema } from "@/lib/zod/EncryptedEnvelope";
import { PostEnvelopeSchema } from "@/lib/zod/methods/PostFederationSchema";
import minioClient from "@/plugins/server/storage/minio.client";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import createDebug from "debug";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { postContentSchema } from "../social";

const debug = createDebug("app:plugins:server:helpers:social:posts");

const federatedPostRequestSchema = z.object({
	method: z.literal("FEDERATE_POST"),
	payload: EncryptedEnvelopeBaseSchema,
	signature: z.string(),
});

const createPostBodySchema = z.union([federatedPostRequestSchema, postContentSchema]);

export const createPost = createAuthEndpoint("/social/posts", {
	method: "POST",
	body: createPostBodySchema,
}, async (context) => {
	const body = context.body;

	if (typeof body === "object" && body !== null && "method" in body && body.method === "FEDERATE_POST") {
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

	const content = body;
	const user = await getSessionFromCtx(context);

	if (!user) {
		return context.json({ error: "Unauthorized" }, { status: 401 });
	}

	const isPrivate = user.user.isPrivate;
	const shouldPropagate = {
		all: true,
		followers: isPrivate,
		none: false,
	}[user.user.postPropagationPolicy as "all" | "followers" | "none"] ?? true;

	const postId = crypto.randomUUID();
	const published = new Date();
	const inserted = await db
		.insert(posts)
		.values({
			id: postId,
			content,
			authorId: user.user.id,
			published,
			isLocal: shouldPropagate,
			isPrivate,
			federationUrl: process.env.BETTER_AUTH_URL!,
			federationPostId: postId,
			createdAt: new Date(),
		})
		.returning({ id: posts.id });

	let federationDeliveriesQueued = 0;

	if (shouldPropagate) {
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

		const uniqueUrls = [
			...new Set([
				...followers.map((f) => f.followingServerUrl).filter(Boolean),
				...following.map((f) => f.followerServerUrl).filter(Boolean),
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
				serverUrl: url,
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
						serverUrl: row.serverUrl,
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

	const protocol = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
	const objectUrl = `${protocol}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${process.env.MINIO_BUCKET}/${objectKey}`;

	return context.json({ presignedUrl, objectUrl, objectKey }, { status: 200 });
});
