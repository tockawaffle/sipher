import { defineTable } from "convex/server";
import { v } from "convex/values";

export const nests = {
	nests: defineTable({
		type: v.union(v.literal("global"), v.literal("regional"), v.literal("private")),
		name: v.string(),
		description: v.optional(v.string()),
		images: v.object({
			banner: v.id("storage"),
			icon: v.id("storage"),
		}),
		colors: v.optional(
			v.object({
				primary: v.string(),
				accent: v.string(),
			})
		),
		createdAt: v.number(),
		updatedAt: v.number(),
		managerId: v.id("user"),
		members: v.array(v.id("user")),
		channels: v.array(v.id("channel")),
		roles: v.array(v.id("role")),
		region: v.optional(v.string()),
		emojis: v.array(v.object({
			id: v.id("storage"),
			name: v.string(),
			createdAt: v.number(),
		})),
	})
		.index("managerId", ["managerId"])
		.index("type", ["type"])
		.index("type_region", ["type", "region"])
		.index("createdAt", ["createdAt"]),
	roles: defineTable({
		nestId: v.id("nests"),
		name: v.string(),
		color: v.optional(v.string()),
		hoist: v.optional(v.boolean()),
		mentionable: v.optional(v.boolean()),
		icon: v.optional(v.id("storage")),
		position: v.optional(v.number()),
		permissions: v.array(v.int64()), // Permissions as bitfield
		flags: v.array(v.int64()), // Flags as bitfield
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("nestId", ["nestId"])
		.index("nestId_position", ["nestId", "position"]),
	channels: defineTable({
		type: v.union(v.literal("text"), v.literal("category"), v.literal("announcement")),
		name: v.string(),
		nestId: v.id("nests"),
		position: v.number(),
		permissions: v.array(v.int64()), // Permissions as bitfield
		overwrites: v.array(v.object({
			id: v.union(v.id("user"), v.id("role")),
			allow: v.union(v.array(v.int64()), v.null()), // Permissions as bitfield
			deny: v.union(v.array(v.int64()), v.null()), // Permissions as bitfield
		})),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("nestId", ["nestId"])
		.index("nestId_position", ["nestId", "position"])
		.index("nestId_type", ["nestId", "type"])
}