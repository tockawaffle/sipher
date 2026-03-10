import { federation } from "@/plugins/server/federation";
import { sipherSocial } from '@/plugins/server/social';
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, haveIBeenPwned, openAPI, testUtils, twoFactor, username } from "better-auth/plugins";
import db from "./db";
import * as schema from "./db/schema";
import EmailService from "./mail";

const isTest = process.env.NODE_ENV === "test";
const emailService: EmailService | undefined = isTest ? undefined : new EmailService();

const federationKeysExist = process.env.FEDERATION_PUBLIC_KEY && process.env.FEDERATION_PRIVATE_KEY;
if (!federationKeysExist) {
	throw new Error("FEDERATION_PUBLIC_KEY and FEDERATION_PRIVATE_KEY must be set, please run `bun run keygen` to generate them.");
}

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET!,
	baseURL: process.env.BETTER_AUTH_URL ?? (process.env.NODE_ENV === "test" ? "http://localhost:3000" : undefined),
	experimental: {
		joins: true
	},
	emailAndPassword: {
		enabled: true,
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ user, url, token }) => {
			try {
				if (isTest) return;
				await emailService!.sendRegisterEmail(user.email, token);
				console.log("Email sent to", user.email);
			} catch (error) {
				console.error("Error sending email", error);
				throw error;
			}
		}
	},
	database: drizzleAdapter(db, {
		provider: "pg",
		schema
	}),
	hooks: {
		after: createAuthMiddleware(async (context) => {
			if (!context.path) return;
			const path = context.path;

			switch (true) {
				case path.startsWith("/sign-up"):
					// key generation logic
					break;
				default:
					break;
			}
		})
	},
	plugins: [
		username(),
		twoFactor(),
		bearer(),
		haveIBeenPwned(),
		sipherSocial(),
		federation(),
		openAPI(),
		testUtils() // TODO: Add a conditional plugin for test utils in development
	],
	// This is disabled by default, but I'll keep this here for ease of mind.
	// You never know when companies will change their minds and decide to start tracking you.
	telemetry: {
		enabled: false
	},
	user: {
		additionalFields: {
			isPrivate: {
				type: "boolean",
				defaultValue: false,
				required: false,
				index: false,
			}
		}
	}
});