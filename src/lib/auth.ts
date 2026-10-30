import { federation } from "@/lib/plugins/federation/server/federation";
import { sipherOven } from "@/lib/plugins/oven/server/index";
import { sipherSocial } from '@/lib/plugins/social/server/social';
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer, haveIBeenPwned, openAPI, testUtils, twoFactor, username } from "better-auth/plugins";
import db from "./db";
import * as schema from "./db/schema";
import EmailService from "./mail";
import minioClient from "./plugins/storage/server/minio.client";
import getRedisClient from "./redis";

// The federation test cluster runs in dev mode but should behave like a test
// environment, so `SIPHER_TEST_MODE` lets the docker compose env files opt in
// explicitly.
const isTest =
	process.env.SIPHER_TEST_MODE === "true" || process.env.NODE_ENV === "test";
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

// Browser clients on these origins may call auth routes with cookies. Same
// list as the CORS allowlist in `app.ts`.
const trustedOrigins = process.env.CORS_ORIGINS
	?.split(",")
	.map((origin) => origin.trim())
	.filter(Boolean);

const bAuth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET!,
	baseURL: process.env.BETTER_AUTH_URL ?? (isTest ? "http://localhost:3000" : undefined),
	trustedOrigins,
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
	plugins: [
		username(),
		twoFactor(),
		bearer(),
		haveIBeenPwned(),
		sipherSocial(),
		federation(),
		openAPI(),
		// Test helpers on `ctx.test` can create sessions; keep them out of production.
		...(isTest ? [testUtils()] : []),
		sipherOven(),
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
			},
		}
	}
});

export const auth: typeof bAuth & { minio: typeof minioClient } = {
	...bAuth,
	minio: minioClient
}