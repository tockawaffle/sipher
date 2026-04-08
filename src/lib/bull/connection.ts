import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedisConnection(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
	}
	return _redis;
}
