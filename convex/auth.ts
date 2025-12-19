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
			openAPI()
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