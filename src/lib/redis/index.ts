import Redis from "ioredis";

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
	if (!redisClient) {
		redisClient = new Redis(process.env.REDIS_URL!);
	}
	return redisClient;
}

export default getRedisClient;