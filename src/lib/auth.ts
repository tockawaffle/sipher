import { federation } from "@/plugins/server/federation";
import { sipherSocial } from '@/plugins/server/social';
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { bearer, haveIBeenPwned, openAPI, testUtils, twoFactor, username } from "better-auth/plugins";
import db from "./db";
import * as schema from "./db/schema";
import EmailService from "./mail";
import minioClient from "./plugins/server/storage/minio.client";
import getRedisClient from "./redis";

const isTest = process.env.NODE_ENV === "test";
const emailService: EmailService | undefined = isTest ? undefined : new EmailService();

const federationKeysExist =
	process.env.FEDERATION_PUBLIC_KEY &&
	process.env.FEDERATION_PRIVATE_KEY &&
	process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY &&
	process.env.FEDERATION_ENCRYPTION_PRIVATE_KEY;
if (!federationKeysExist) {
	throw new Error(
		"All federation keys must be set (FEDERATION_PUBLIC_KEY, FEDERATION_PRIVATE_KEY, " +
		"FEDERATION_ENCRYPTION_PUBLIC_KEY, FEDERATION_ENCRYPTION_PRIVATE_KEY). " +
		"Run `bun run keygen` to generate them.",
	);
}

const bAuth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET!,
	baseURL: process.env.BETTER_AUTH_URL ?? (process.env.NODE_ENV === "test" ? "http://localhost:3000" : undefined),
	experimental: {
		joins: true
	},
	emailAndPassword: {
		autoSignIn: false,
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
	secondaryStorage: {
		get: async (key) => {
			const value = await getRedisClient().get(key);
			return value ? JSON.parse(value) : null;
		},
		set: async (key, value, ttl) => {
			await getRedisClient().setex(key, ttl ?? 3600 * 24 * 7, JSON.stringify(value));
		},
		delete: async (key) => {
			await getRedisClient().del(key);
		}
	},
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
		testUtils(), // TODO: Add a conditional plugin for test utils in development
		bearer()
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
			},
			postPropagationPolicy: {
				type: "string",
				defaultValue: "all",
				required: false,
				index: false,
				enum: ["all", "followers", "none"] as const,
			}
		}
	}
});

export const auth: typeof bAuth & { minio: typeof minioClient } = {
	...bAuth,
	minio: minioClient
}