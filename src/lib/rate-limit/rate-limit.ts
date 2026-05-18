import getRedisClient from "@/lib/redis";

export interface RateLimitOptions {
	/** Maximum number of requests allowed in the window. */
	limit: number;
	/** Sliding window size, in seconds. */
	windowSeconds: number;
}

export type RateLimitResult =
	| { allowed: true; remaining: number }
	| { allowed: false; retryAfter: number };

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 *
 * Each call atomically:
 *  1. Removes entries older than `now - windowSeconds`.
 *  2. Adds the current timestamp as a new entry.
 *  3. Reads the count.
 *  4. Refreshes the key TTL.
 *
 * If the resulting count exceeds `limit`, the request is rejected.
 * The key is namespaced as `rl:<identifier>` so callers control
 * the scope (IP, IP+route, session id, …).
 */
export async function checkRateLimit(
	identifier: string,
	options: RateLimitOptions,
): Promise<RateLimitResult> {
	const redis = getRedisClient();
	const { limit, windowSeconds } = options;
	const now = Date.now();
	const windowStart = now - windowSeconds * 1000;
	const key = `rl:${identifier}`;
	const member = `${now}-${Math.random().toString(36).slice(2)}`;

	const pipeline = redis.pipeline();
	pipeline.zremrangebyscore(key, "-inf", windowStart);
	pipeline.zadd(key, now, member);
	pipeline.zcard(key);
	pipeline.expire(key, windowSeconds + 1);

	const results = await pipeline.exec();
	const count = (results?.[2]?.[1] as number) ?? 0;

	if (count > limit) {
		return { allowed: false, retryAfter: windowSeconds };
	}

	return { allowed: true, remaining: limit - count };
}
