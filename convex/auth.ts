import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { captcha, oneTimeToken, openAPI, username } from "better-auth/plugins";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL!;

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel, typeof authSchema>(
	components.betterAuth,
	{
		local: {
			schema: authSchema
		}
	}
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
	return {
		baseURL: siteUrl,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
			autoSignIn: true
		},
		user: {
			additionalFields: {
				metadata: {
					type: "json",
					required: false,
				},
				friends: {
					type: "string[]",
					required: false,
					index: true
				}
			},
		},
		plugins: [
			convex({
				authConfig,
				jwksRotateOnTokenGenerationError: true,
			}),
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: process.env.CAPTCHA_SECRET_KEY!,
			}),
			username({
				displayUsernameValidator: (displayUsername) => {
					// Allow only alphanumeric characters, underscores, and hyphens
					return /^[a-zA-Z0-9_-]+$/.test(displayUsername)
				}
			}),
			oneTimeToken(),
			openAPI(),
		],
	} satisfies BetterAuthOptions;
}

export const createAuth = (
	ctx: GenericCtx<DataModel>
) => {
	return betterAuth(createAuthOptions(ctx));
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	},
});

export const sendKeysToServer = mutation({
	args: {
		userId: v.string(),
		identityKey: v.object({
			curve25519: v.string(),
			ed25519: v.string(),
		}),
		oneTimeKeys: v.array(v.object({
			keyId: v.string(),
			publicKey: v.string(),
		})),
		forceInsert: v.boolean(),
	},
	handler: async (ctx, args) => {
		return ctx.runMutation(components.betterAuth.olm.index.sendKeysToServer, {
			userId: args.userId,
			identityKey: args.identityKey,
			oneTimeKeys: args.oneTimeKeys,
			forceInsert: args.forceInsert,
		});
	},
});

export const retrieveServerOlmAccount = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		return ctx.runQuery(components.betterAuth.olm.index.retrieveServerOlmAccount, {
			userId: args.userId,
		});
	},
});

export const updateUserStatus = mutation({
	args: {
		status: v.union(v.literal("online"), v.literal("busy"), v.literal("offline"), v.literal("away")),
		isUserSet: v.boolean(),
	},
	handler: async (ctx, args) => {
		return ctx.runMutation(components.betterAuth.user.index.updateUserStatus, {
			status: args.status,
			isUserSet: args.isUserSet,
		});
	},
});

export const updateUserMetadata = mutation({
	args: {
		metadata: v.object({
			phrasePreference: v.union(v.literal("comforting"), v.literal("mocking"), v.literal("both")),
		}),
	},
	handler: async (ctx, args) => {
		return ctx.runMutation(components.betterAuth.user.index.updateUserMetadata, {
			metadata: args.metadata,
		});
	},
});

export const sendFriendRequest = mutation({
	args: {
		username: v.string(),
	},
	handler: async (ctx, args) => {
		return ctx.runMutation(components.betterAuth.user.index.sendFriendRequest, {
			username: args.username,
		});
	},
});

export const answerFriendRequest = mutation({
	args: {
		requestId: v.string(),
		answer: v.union(v.literal("accept"), v.literal("decline"), v.literal("ignore")),
	},
	handler: async (ctx, args) => {
		return ctx.runMutation(components.betterAuth.user.index.answerFriendRequest, {
			requestId: args.requestId,
			answer: args.answer,
		});
	},
});

export const getFriendRequests = query({
	args: {},
	handler: async (ctx) => {
		return ctx.runQuery(components.betterAuth.user.index.getFriendRequests)
	},
});

export const getFriends = query({
	args: {},
	handler: async (ctx) => {
		return ctx.runQuery(components.betterAuth.user.index.getFriends)
	},
});

export const getUserStatus = query({
	args: {},
	handler: async (ctx) => {
		return ctx.runQuery(components.betterAuth.user.index.getUserStatus)
	},
});

export const getParticipantDetails = query({
	args: {
		participantIds: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		return ctx.runQuery(components.betterAuth.user.index.getParticipantDetails, {
			participantIds: args.participantIds,
		});
	},
});