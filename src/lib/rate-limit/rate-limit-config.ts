import type { RateLimitOptions } from "@/lib/rate-limit/rate-limit";

export interface RouteRateLimitConfig extends RateLimitOptions {
	/**
	 * HTTP methods this rule applies to.
	 * Omit to apply to all methods.
	 */
	methods?: string[];
}

/**
 * Centralized rate-limit rules for all external-facing routes.
 *
 * Keys are exact URL pathnames (no query string).
 * Each rule is enforced per-IP in the custom HTTP server before the
 * request ever reaches a Next.js route handler.
 *
 * Limits are intentionally conservative — adjust as traffic patterns
 * emerge in production.
 *
 * Federation endpoints (unauthenticated)
 *   /discover               – server registration; 1 per 6 min/IP prevents spamming new entries
 *   /discover/rotate/init   – key rotation kickoff; tight limit stops DoS / blacklist abuse
 *   /discover/rotate/confirm– challenge confirmation; tight limit stops brute-force
 *   /proxy                  – traffic relay; generous but bounded IP-level budget
 *                             (a per-origin limit is also enforced inside proxy/route.ts)
 *
 * Social endpoints (session-authenticated — rate limit is a backstop for spam/automation)
 *   /api/auth/social/posts  – post creation
 *   /api/auth/social/follows– follow actions
 */
// Raised during automated tests so full suites are not blocked by per-IP windows.
// `process.env.NODE_ENV` would be replaced at compile time by Next.js, so we
// also accept `SIPHER_TEST_MODE` which the dockerized test cluster sets at
// runtime while keeping `NODE_ENV=development` (same trick used in `src/lib/auth.ts`).
const env = { ...process.env };
const isTestMode =
	env.NODE_ENV === "test" || env.SIPHER_TEST_MODE === "true";
const RLM = isTestMode
	? { discoverPost: 2000, rotate: 500, proxyPost: 10_000 }
	: { discoverPost: 10, rotate: 5, proxyPost: 120 };

export const RATE_LIMIT_ROUTES: Record<string, RouteRateLimitConfig> = {
	"/discover": {
		methods: ["POST"],
		limit: RLM.discoverPost,
		windowSeconds: 3600,
	},
	"/discover/rotate/init": {
		methods: ["POST"],
		limit: RLM.rotate,
		windowSeconds: 60,
	},
	"/discover/rotate/confirm": {
		methods: ["POST"],
		limit: RLM.rotate,
		windowSeconds: 60,
	},
	"/proxy": {
		methods: ["POST"],
		limit: RLM.proxyPost,
		windowSeconds: 60,
	}
};
