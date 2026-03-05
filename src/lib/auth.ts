import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import db from "./db";

export const auth = betterAuth({
	experimental: {
		joins: true
	},
	database: drizzleAdapter(db, { provider: "pg" }),
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
	}
});