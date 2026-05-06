import db from '@/lib/db';
import { deliveryJobs } from '@/lib/db/schema';
import { Worker } from 'bullmq';
import createDebug from 'debug';
import { eq } from 'drizzle-orm';
import { getRedisWorkerConnection } from './connection';
import { processFederationDelivery } from './processors/delivery';
import { processHealthCheck } from './processors/health-check';
import { DELIVERY_QUEUE_NAME, HEALTH_CHECK_QUEUE_NAME, type FederationDeliveryJob, type HealthCheckJob } from './queues';

const debug = createDebug('app:federation:worker');

interface WorkerHandles {
	deliveryWorker: Worker<FederationDeliveryJob>;
	healthCheckWorker: Worker<HealthCheckJob>;
}

let _workers: WorkerHandles | null = null;

export function startFederationWorker(): WorkerHandles {
	if (_workers) {
		debug('workers already running, skipping duplicate startup');
		return _workers;
	}

	console.log('[federation] Starting workers...');

	const deliveryWorker = new Worker<FederationDeliveryJob>(
		DELIVERY_QUEUE_NAME,
		processFederationDelivery,
		{
			connection: getRedisWorkerConnection() as never,
			concurrency: 10,
		},
	);

	deliveryWorker.on('ready', () => {
		console.log('[federation] Delivery worker connected to Redis and ready');
	});

	deliveryWorker.on('failed', (job, err) => {
		const retriesLeft = (job?.opts.attempts ?? 0) - (job?.attemptsMade ?? 0);
		debug(
			'delivery job %s (%s) to %s failed (attempt %d, %d retries left): %s',
			job?.id, job?.name, job?.data.targetUrl, job?.attemptsMade, retriesLeft, err.message,
		);
		if (err.cause) debug('cause: %O', err.cause);
	});

	deliveryWorker.on('completed', async (job) => {
		debug('delivery job %s (%s) completed, cleaning up delivery record %s', job.id, job.name, job.data.deliveryJobId);
		try {
			await db.delete(deliveryJobs).where(eq(deliveryJobs.id, job.data.deliveryJobId));
		} catch (err) {
			debug('failed to clean up delivery job %s: %O', job.data.deliveryJobId, err);
		}
	});

	deliveryWorker.on('error', (err) => {
		console.error('[federation] Delivery worker error:', err);
	});

	const healthCheckWorker = new Worker<HealthCheckJob>(
		HEALTH_CHECK_QUEUE_NAME,
		processHealthCheck,
		{
			connection: getRedisWorkerConnection() as never,
			concurrency: 3,
		},
	);

	healthCheckWorker.on('ready', () => {
		console.log('[federation] Health-check worker connected to Redis and ready');
	});

	healthCheckWorker.on('failed', (job, err) => {
		debug('health-check job %s failed: %s', job?.id, err.message);
	});

	healthCheckWorker.on('error', (err) => {
		console.error('[federation] Health-check worker error:', err);
	});

	_workers = { deliveryWorker, healthCheckWorker };

	debug('all workers started');
	return _workers;
}
