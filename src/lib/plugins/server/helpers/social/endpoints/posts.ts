import db from "@/lib/db";
import { posts } from "@/lib/db/schema";
import minioClient from "@/plugins/server/storage/minio.client";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
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