import Redis from 'ioredis';

let _redis: Redis | null = null;
let _workerRedis: Redis | null = null;

export function getRedisConnection(): Redis {
	if (!_redis) {
		_redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
	}
	return _redis;
}

export function getRedisWorkerConnection(): Redis {
	if (!_workerRedis) {
		_workerRedis = new Redis(process.env.REDIS_URL!, {
			maxRetriesPerRequest: null,
		});
	}
	return _workerRedis;
}
