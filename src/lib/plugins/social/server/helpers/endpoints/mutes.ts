import db from "@/lib/db";
import { mutes } from "@/lib/db/schema";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const createMute = createAuthEndpoint("/social/mutes", {
	method: "POST",
	body: z.object({
		userId: z.string().min(1),
	}),
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const { userId: mutedUserId } = context.body;

	if (mutedUserId === session.user.id) {
		return context.json({ error: "You cannot mute yourself." }, { status: 400 });
	}

	const [existing] = await db
		.select({ id: mutes.id })
		.from(mutes)
		.where(and(eq(mutes.userId, session.user.id), eq(mutes.mutedUserId, mutedUserId)))
		.limit(1);

	if (existing) {
		return context.json({ error: "User is already muted." }, { status: 409 });
	}

	const [mute] = await db
		.insert(mutes)
		.values({
			id: crypto.randomUUID(),
			userId: session.user.id,
			mutedUserId,
			createdAt: new Date(),
		})
		.returning();

	return context.json({ mute }, { status: 201 });
});

export const deleteMute = createAuthEndpoint("/social/mutes/:id", {
	method: "DELETE",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = context.params;

	const [mute] = await db
		.select({ id: mutes.id, userId: mutes.userId })
		.from(mutes)
		.where(eq(mutes.id, id))
		.limit(1);

	if (!mute) return context.json({ error: "Mute not found." }, { status: 404 });

	if (mute.userId !== session.user.id) {
		return context.json({ error: "Forbidden." }, { status: 403 });
	}

	await db.delete(mutes).where(eq(mutes.id, id));

	return context.json({ success: true }, { status: 200 });
});

export const getMutes = createAuthEndpoint("/social/mutes", {
	method: "GET",
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const userMutes = await db
		.select()
		.from(mutes)
		.where(eq(mutes.userId, session.user.id));

	return context.json({ mutes: userMutes }, { status: 200 });
});
