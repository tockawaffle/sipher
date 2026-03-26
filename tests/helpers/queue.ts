import { Queue, type Job } from "bullmq"
import Redis from "ioredis"

function createRedis() {
	return new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })
}

const HEALTH_CHECK_QUEUE = "federation-health-check"
const RETRY_QUEUE = "federation-retry"

let _healthQueue: Queue | null = null
let _retryQueue: Queue | null = null

export function getTestHealthCheckQueue(): Queue {
	if (!_healthQueue) {
		_healthQueue = new Queue(HEALTH_CHECK_QUEUE, { connection: createRedis() as never })
	}
	return _healthQueue
}

export function getTestRetryQueue(): Queue {
	if (!_retryQueue) {
		_retryQueue = new Queue(RETRY_QUEUE, { connection: createRedis() as never })
	}
	return _retryQueue
}

export async function getHealthCheckJobsFor(serverUrl: string): Promise<Job[]> {
	const queue = getTestHealthCheckQueue()
	const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"])
	return jobs.filter((j) => j.data?.serverUrl === serverUrl)
}

export async function getRetryJobsFor(serverUrl: string): Promise<Job[]> {
	const queue = getTestRetryQueue()
	const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"])
	return jobs.filter((j) => j.data?.serverUrl === serverUrl)
}

export async function drainAllQueues(): Promise<void> {
	const hq = getTestHealthCheckQueue()
	const rq = getTestRetryQueue()
	await hq.obliterate({ force: true }).catch(() => {})
	await rq.obliterate({ force: true }).catch(() => {})
}

export async function closeQueues(): Promise<void> {
	if (_healthQueue) { await _healthQueue.close(); _healthQueue = null }
	if (_retryQueue) { await _retryQueue.close(); _retryQueue = null }
}
