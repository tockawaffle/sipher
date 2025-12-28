import { defineTable } from "convex/server";
import { v } from "convex/values";

export const user = {
	user: defineTable({
		name: v.string(),
		email: v.string(),
		emailVerified: v.boolean(),
		image: v.optional(v.union(v.null(), v.string())),
		createdAt: v.number(),
		updatedAt: v.number(),
		userId: v.optional(v.union(v.null(), v.string())),
		username: v.optional(v.union(v.null(), v.string())),
		displayUsername: v.optional(v.union(v.null(), v.string())),
		metadata: v.optional(v.object({
			phrasePreference: v.union(v.literal("comforting"), v.literal("mocking"), v.literal("both")),
		})),
	})
		.index("email_name", ["email", "name"])
		.index("byName", ["name"])
		.index("userId", ["userId"])
		.index("username", ["username"]),
	userStatus: defineTable({
		userId: v.id("user"),
		status: v.union(v.literal("online"), v.literal("busy"), v.literal("offline"), v.literal("away")),
		isUserSet: v.boolean(),
		updatedAt: v.number(),
	})
		.index("userId", ["userId"])
		.index("status", ["status"]),
	friendRequests: defineTable({
		userId: v.id("user"),
		requestTo: v.id("user"),
		method: v.union(v.literal("receive"), v.literal("send")),
		requestId: v.string(),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()),
		acceptedAt: v.optional(v.number()),
		declinedAt: v.optional(v.number()),
		ignoredAt: v.optional(v.number()),
	})
		.index("userId_method", ["userId", "method"])
		.index("userId", ["userId"])
		.index("requestId", ["requestId"])
		.index("requestTo", ["requestTo"])
		.index("expiresAt", ["expiresAt"]),
	friends: defineTable({
		userId: v.id("user"),
		friendId: v.id("user"),
		createdAt: v.number(),
	})
		.index("userId", ["userId"])
		.index("friendId", ["friendId"])
		.index("userId_friendId", ["userId", "friendId"]),
}