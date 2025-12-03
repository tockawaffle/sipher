import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { captcha, username } from "better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
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

export const createAuth = (
	ctx: GenericCtx<DataModel>,
	{ optionsOnly } = { optionsOnly: false },
) => {
	return betterAuth({
		logger: {
			disabled: optionsOnly,
		},
		baseURL: siteUrl,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		plugins: [
			convex(),
			captcha({
				provider: "cloudflare-turnstile",
				secretKey: process.env.CAPTCHA_SECRET_KEY!,
			}),
			username({
				displayUsernameValidator: (displayUsername) => {
					// Allow only alphanumeric characters, underscores, and hyphens
					return /^[a-zA-Z0-9_-]+$/.test(displayUsername)
				}
			})
		],
	});
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return authComponent.getAuthUser(ctx);
	},
});