import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { mutation, MutationCtx, query, QueryCtx } from "../_generated/server";

// Overload signatures
async function userValidation(ctx: MutationCtx | QueryCtx, options: { required: false }): Promise<{ userId: Id<"user">; user: any } | null>;
async function userValidation(ctx: MutationCtx | QueryCtx, options?: { required?: true }): Promise<{ userId: Id<"user">; user: any }>;

// Implementation
async function userValidation(ctx: MutationCtx | QueryCtx, options?: { required?: boolean }) {
	const required = options?.required ?? true;

	const user = await ctx.auth.getUserIdentity();
	if (!user) {
		if (required) throw new Error("User not found");
		return null;
	}

	const userId = ctx.db.normalizeId("user", user.subject as string) as Id<"user">;
	if (!userId) {
		if (required) throw new Error("User not found");
		return null;
	}

	return { userId, user };
}

export const updateUserStatus = mutation({
	args: {
		status: v.union(v.literal("online"), v.literal("busy"), v.literal("offline"), v.literal("away")),
		isUserSet: v.boolean(),
	},
	handler: async (ctx, args) => {
		try {
			const { userId } = await userValidation(ctx);

			// Check if user status is already set
			const userStatus = await ctx.db.query("userStatus").withIndex("userId", (q) => q.eq("userId", userId)).first();
			if (userStatus) {
				await ctx.db.patch(userStatus._id, {
					status: args.status,
					isUserSet: args.isUserSet,
					updatedAt: Date.now(),
				});
			} else {
				await ctx.db.insert("userStatus", {
					userId: userId,
					status: args.status,
					isUserSet: false,
					updatedAt: Date.now(),
				});
			}
			return { success: true, message: "User status updated successfully" };
		} catch (error) {
			console.error("Error updating user status:", error);
			throw new Error("Failed to update user status");
		}
	},
});

export const getUserStatus = query({
	handler: async (ctx) => {
		const validation = await userValidation(ctx, { required: false });
		if (!validation) {
			return null; // User not authenticated
		}

		const { userId } = validation;
		const userStatus = await ctx.db.query("userStatus").withIndex("userId", (q) => q.eq("userId", userId)).first();
		return userStatus;
	}
});

export const updateUserMetadata = mutation({
	args: {
		metadata: v.object({
			phrasePreference: v.union(v.literal("comforting"), v.literal("mocking"), v.literal("both")),
		}),
	},
	handler: async (ctx, args) => {
		const { userId } = await userValidation(ctx);

		return ctx.db.patch("user", userId, {
			metadata: args.metadata,
		});
	},
});

export const sendFriendRequest = mutation({
	args: {
		username: v.string(),
	},
	handler: async (ctx, args) => {
		const { userId, user: currentUser } = await userValidation(ctx);

		// Find the target user
		const targetUser = await ctx.db.query("user").withIndex("byName", (q) => q.eq("name", args.username)).first();
		if (!targetUser) {
			throw new Error("User not found");
		}

		// Check if trying to send request to yourself
		if (targetUser._id === userId) {
			throw new Error("You cannot send a friend request to yourself");
		}

		// Check if already friends
		const existingFriendship = await ctx.db
			.query("friends")
			.withIndex("userId_friendId", (q) => q.eq("userId", userId).eq("friendId", targetUser._id))
			.first();

		if (existingFriendship) {
			throw new Error("You are already friends with this user");
		}

		// Check for existing requests in both directions
		const existingRequests = await ctx.db
			.query("friendRequests")
			.filter((q) =>
				q.or(
					q.and(
						q.eq(q.field("userId"), userId),
						q.eq(q.field("requestTo"), targetUser._id)
					),
					q.and(
						q.eq(q.field("userId"), targetUser._id),
						q.eq(q.field("requestTo"), userId)
					)
				)
			)
			.filter((q) => q.eq(q.field("acceptedAt"), undefined))
			.filter((q) => q.eq(q.field("declinedAt"), undefined))
			.collect();

		const existingSentRequest = existingRequests.find(r => r.userId === userId);
		const incomingRequest = existingRequests.find(r => r.userId === targetUser._id);

		if (existingSentRequest) {
			throw new Error("You have already sent a friend request to this user");
		}

		if (incomingRequest) {
			const timestamp = Date.now();

			// Auto-accept the incoming request
			await ctx.db.patch(incomingRequest._id, {
				acceptedAt: timestamp,
			});

			// Create bidirectional friendship entries
			await Promise.all([
				ctx.db.insert("friends", {
					userId: userId,
					friendId: targetUser._id,
					createdAt: timestamp,
				}),
				ctx.db.insert("friends", {
					userId: targetUser._id,
					friendId: userId,
					createdAt: timestamp,
				}),
			]);

			return {
				success: true,
				message: "Friend request accepted automatically (they had already sent you a request)",
			};
		}

		// Create the friend request (single row)
		const requestId = crypto.randomUUID();
		await ctx.db.insert("friendRequests", {
			userId: userId,
			requestTo: targetUser._id,
			method: "send",
			requestId,
			createdAt: Date.now(),
		});

		return {
			success: true,
			message: "Friend request sent successfully",
		};
	}
})

export const answerFriendRequest = mutation({
	args: {
		requestId: v.string(),
		answer: v.union(v.literal("accept"), v.literal("decline"), v.literal("ignore")),
	},
	handler: async (ctx, args) => {
		const { userId } = await userValidation(ctx);

		// Get the friend request
		const request = await ctx.db
			.query("friendRequests")
			.withIndex("requestId", (q) => q.eq("requestId", args.requestId))
			.first();

		if (!request) {
			throw new Error("Request not found");
		}

		// Verify current user is the recipient
		if (request.requestTo !== userId) {
			throw new Error("You are not the recipient of this request");
		}

		// Check if already answered
		if (request.acceptedAt || request.declinedAt || request.ignoredAt) {
			throw new Error("Request already answered");
		}

		const timestamp = Date.now();

		// Update the request based on the answer
		switch (args.answer) {
			case "accept":
				// Update request status
				await ctx.db.patch(request._id, { acceptedAt: timestamp });

				// Create bidirectional friendship entries
				await Promise.all([
					ctx.db.insert("friends", {
						userId: userId,
						friendId: request.userId,
						createdAt: timestamp,
					}),
					ctx.db.insert("friends", {
						userId: request.userId,
						friendId: userId,
						createdAt: timestamp,
					}),
				]);
				break;

			case "decline":
				await ctx.db.patch(request._id, { declinedAt: timestamp });
				break;

			case "ignore":
				await ctx.db.patch(request._id, { ignoredAt: timestamp });
				break;
		}

		return {
			success: true,
			message: `Friend request ${args.answer}ed successfully`,
		};
	}
})

export const getFriendRequests = query({
	handler: async (ctx) => {
		const { userId } = await userValidation(ctx);

		// Get all unanswered requests involving this user (sent by them OR sent to them)
		const allRequests = await ctx.db
			.query("friendRequests")
			.filter((q) =>
				q.or(
					q.eq(q.field("userId"), userId),      // Requests sent by me
					q.eq(q.field("requestTo"), userId)     // Requests sent to me
				)
			)
			.filter((q) => q.eq(q.field("acceptedAt"), undefined))
			.filter((q) => q.eq(q.field("declinedAt"), undefined))
			.filter((q) => q.eq(q.field("ignoredAt"), undefined))
			.collect();

		// Transform to include method field based on perspective
		const requestsWithMethod = await Promise.all(
			allRequests.map(async (request) => {
				const isSentByMe = request.userId === userId;
				const otherUserId = isSentByMe ? request.requestTo : request.userId;
				const otherUser = await ctx.db.get(otherUserId);

				return {
					id: request.requestId,
					_id: request._id,
					userId: otherUserId,
					username: otherUser?.username || otherUser?.displayUsername || otherUser?.name || "Unknown",
					avatar: otherUser?.image || "",
					createdAt: request.createdAt,
					method: isSentByMe ? "send" : "receive",
				};
			})
		);

		return requestsWithMethod;
	}
})

export const getFriends = query({
	handler: async (ctx) => {
		const { userId } = await userValidation(ctx);

		// Get all friendships for this user
		const friendships = await ctx.db
			.query("friends")
			.withIndex("userId", (q) => q.eq("userId", userId))
			.collect();

		// Populate friend data with relevant fields
		const friends = await Promise.all(
			friendships.map(async (friendship) => {
				const friend = await ctx.db.get(friendship.friendId);
				const friendStatus = await ctx.db.query("userStatus").withIndex("userId", (q) => q.eq("userId", friendship.friendId)).first();
				if (!friend) return null;

				return {
					_id: friend._id,
					id: friend._id,
					name: friend.name,
					username: friend.username,
					displayUsername: friend.displayUsername,
					image: friend.image,
					friendshipCreatedAt: friendship.createdAt,
					status: friendStatus ? {
						status: friendStatus.status,
						isUserSet: friendStatus.isUserSet,
					} : {
						status: "offline" as const,
						isUserSet: false,
					},
				};
			})
		);

		return friends.filter(Boolean);
	}
})

export const getParticipantDetails = query({
	args: {
		participantIds: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const { participantIds } = args;
		const { userId } = await userValidation(ctx);
		if (!userId) throw new Error("User not found");

		if (participantIds.length === 0) return [];
		const normalizedParticipantIds = participantIds.map((id) => ctx.db.normalizeId("user", id));
		if (normalizedParticipantIds.length === 0) return [];

		// Filter out all null values
		const filteredParticipantIds = normalizedParticipantIds.filter((id) => id !== null);
		if (filteredParticipantIds.length === 0) return [];

		const participantDetails = await Promise.all(filteredParticipantIds.map(async (id) => {
			const participant = await ctx.db.get("user", id)
			const participantStatus = await ctx.db.query("userStatus").withIndex("userId", (q) => q.eq("userId", id)).first();
			const participantOlmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", id)).first();
			if (!participant) return null;

			return {
				id: participant._id,
				name: participant.name,
				username: participant.username,
				displayUsername: participant.displayUsername,
				image: participant.image,
				status: participantStatus?.status || "offline",
				olmAccount: participantOlmAccount,
			}
		}));

		return participantDetails
	}
})