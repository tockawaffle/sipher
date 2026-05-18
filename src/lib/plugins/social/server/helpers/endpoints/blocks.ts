import db from "@/lib/db";
import { blocks, follows } from "@/lib/db/schema";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const createBlock = createAuthEndpoint("/social/blocks", {
	method: "POST",
	body: z.object({
		userId: z.string().min(1),
	}),
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const { userId: blockedUserId } = context.body;

	if (blockedUserId === session.user.id) {
		return context.json({ error: "You cannot block yourself." }, { status: 400 });
	}

	const [existing] = await db
		.select({ id: blocks.id })
		.from(blocks)
		.where(and(eq(blocks.blockerId, session.user.id), eq(blocks.blockedUserId, blockedUserId)))
		.limit(1);

	if (existing) {
		return context.json({ error: "User is already blocked." }, { status: 409 });
	}

	const [block] = await db
		.insert(blocks)
		.values({
			id: crypto.randomUUID(),
			blockerId: session.user.id,
			blockedUserId,
			createdAt: new Date(),
		})
		.returning();

	// Remove any existing follow relationship in both directions.
	await db.delete(follows).where(
		and(eq(follows.followerId, session.user.id), eq(follows.followingId, blockedUserId)),
	);
	await db.delete(follows).where(
		and(eq(follows.followerId, blockedUserId), eq(follows.followingId, session.user.id)),
	);

	return context.json({ block }, { status: 201 });
});

export const deleteBlock = createAuthEndpoint("/social/blocks/:id", {
	method: "DELETE",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const { id } = context.params;

	const [block] = await db
		.select({ id: blocks.id, blockerId: blocks.blockerId })
		.from(blocks)
		.where(eq(blocks.id, id))
		.limit(1);

	if (!block) return context.json({ error: "Block not found." }, { status: 404 });

	if (block.blockerId !== session.user.id) {
		return context.json({ error: "Forbidden." }, { status: 403 });
	}

	await db.delete(blocks).where(eq(blocks.id, id));

	return context.json({ success: true }, { status: 200 });
});

export const getBlocks = createAuthEndpoint("/social/blocks", {
	method: "GET",
}, async (context) => {
	const session = await getSessionFromCtx(context);
	if (!session) return context.json({ error: "Unauthorized" }, { status: 401 });

	const userBlocks = await db
		.select()
		.from(blocks)
		.where(eq(blocks.blockerId, session.user.id));

	return context.json({ blocks: userBlocks }, { status: 200 });
});
