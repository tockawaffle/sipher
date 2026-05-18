import { Queue } from 'bullmq';
import createDebug from 'debug';
import { createHash } from 'node:crypto';
import { getRedisConnection } from './connection';

const debug = createDebug('app:federation:worker');

// ---------------------------------------------------------------------------
// Federation delivery queue
// ---------------------------------------------------------------------------

export interface FederationDeliveryJob {
	deliveryJobId: string;
	targetUrl: string;
	serverUrl: string;
	payload: string;
}

export const DELIVERY_QUEUE_NAME = 'federation-delivery';

let _deliveryQueue: Queue<FederationDeliveryJob> | null = null;

export function getFederationQueue(): Queue<FederationDeliveryJob> {
	if (!_deliveryQueue) {
		_deliveryQueue = new Queue<FederationDeliveryJob>(DELIVERY_QUEUE_NAME, {
			connection: getRedisConnection() as never,
			defaultJobOptions: {
				attempts: 5,
				backoff: {
					type: 'exponential',
					delay: 5_000,
				},
				removeOnComplete: { age: 60 * 60 * 24 },
				removeOnFail: { age: 60 * 60 * 24 * 7 },
			},
		});
	}
	return _deliveryQueue;
}

// ---------------------------------------------------------------------------
// Health-check queue
// ---------------------------------------------------------------------------

export interface HealthCheckJob {
	serverUrl: string;
}

export const HEALTH_CHECK_QUEUE_NAME = 'federation-health-check';

let _healthCheckQueue: Queue<HealthCheckJob> | null = null;

export function getHealthCheckQueue(): Queue<HealthCheckJob> {
	if (!_healthCheckQueue) {
		_healthCheckQueue = new Queue<HealthCheckJob>(HEALTH_CHECK_QUEUE_NAME, {
			connection: getRedisConnection() as never,
		});
	}
	return _healthCheckQueue;
}

export async function scheduleHealthCheck(serverUrl: string, attempt: number): Promise<void> {
	const delayMinutes = 5 + (attempt * 10);
	const delayMs = delayMinutes * 60 * 1000;
	debug('scheduling health check for %s in %d minutes (attempt %d)', serverUrl, delayMinutes, attempt);

	const safeId = createHash('sha256').update(serverUrl).digest('hex').slice(0, 16);
	await getHealthCheckQueue().add('health-check', { serverUrl }, {
		delay: delayMs,
		jobId: `health-check_${safeId}_${attempt}`,
		removeOnComplete: true,
		removeOnFail: true,
	});
}
