import db from "@/lib/db";
import { deliveryJobs, follows, posts } from "@/lib/db/schema";
import { getFederationQueue, type FederationDeliveryJob } from "@/lib/bull";
import minioClient from "@/plugins/server/storage/minio.client";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { postContentSchema } from "../social";

export const createPost = createAuthEndpoint("/social/posts", {
	method: "POST",
	body: postContentSchema,
}, async (context) => {
	const content = context.body;
	const user = await getSessionFromCtx(context)

	if (!user) {
		return context.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Create post
	const post = await db.insert(posts).values({
		id: crypto.randomUUID(),
		content: content,
		authorId: user.user.id,
		published: new Date(),
		isLocal: true,
		createdAt: new Date(),
	}).returning({ id: posts.id });

	// Enqueue federation delivery jobs for each follower's server
	const followers = await db.select().from(follows).where(and(eq(follows.followingId, user.user.id), eq(follows.accepted, true)));
	const uniqueUrls = [...new Set(followers.map(f => f.followerServerUrl).filter(Boolean))] as string[];
	const payload = JSON.stringify({ content });

	const jobRows = uniqueUrls.map(url => ({
		id: crypto.randomUUID(),
		targetUrl: url + "/social/posts",
		serverUrl: url,
		payload,
		attempts: 0,
		createdAt: new Date(),
	}));

	if (jobRows.length > 0) {
		await db.insert(deliveryJobs).values(jobRows);

		await getFederationQueue().addBulk(
			jobRows.map(row => ({
				name: 'deliver-post' as const,
				data: {
					deliveryJobId: row.id,
					targetUrl: row.targetUrl,
					serverUrl: row.serverUrl,
					payload: row.payload,
				} satisfies FederationDeliveryJob,
			})),
		);
	}

	return context.json({ id: post[0].id }, { status: 200 });

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
})