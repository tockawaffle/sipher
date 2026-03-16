import db from '@/lib/db';
import { blacklistedServers, deliveryJobs, follows, serverRegistry } from '@/lib/db/schema';
import { encryptPayload, getOwnSigningSecretKey, signMessage } from '@/lib/federation/keytools';
import { discoverAndRegister, DiscoveryError } from '@/lib/federation/registry';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import createDebug from 'debug';
import { eq } from 'drizzle-orm';
import Redis from 'ioredis';

const debug = createDebug('app:federation:worker');

export interface FederationDeliveryJob {
	deliveryJobId: string;
	targetUrl: string;
	serverUrl: string;
	payload: string;
}

const QUEUE_NAME = 'federation-delivery';

function createRedisConnection() {
	return new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
}

let _queue: Queue<FederationDeliveryJob> | null = null;

export function getFederationQueue(): Queue<FederationDeliveryJob> {
	if (!_queue) {
		_queue = new Queue<FederationDeliveryJob>(QUEUE_NAME, {
			connection: createRedisConnection() as never,
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
	return _queue;
}

async function processFederationDelivery(job: Job<FederationDeliveryJob>) {
	const { deliveryJobId, targetUrl, serverUrl, payload } = job.data;
	debug('processing job %s (%s) → %s (attempt %d)', job.id, job.name, targetUrl, job.attemptsMade + 1);

	const [blacklisted] = await db
		.select({ id: blacklistedServers.id })
		.from(blacklistedServers)
		.where(eq(blacklistedServers.serverUrl, serverUrl))
		.limit(1);

	if (blacklisted) {
		debug('server %s is blacklisted, dropping job %s', serverUrl, job.id);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		throw new UnrecoverableError(`Server ${serverUrl} is blacklisted, skipping delivery`);
	}

	let encryptionPublicKey: string;

	const [server] = await db
		.select({ encryptionPublicKey: serverRegistry.encryptionPublicKey })
		.from(serverRegistry)
		.where(eq(serverRegistry.url, serverUrl))
		.limit(1);

	if (server) {
		encryptionPublicKey = server.encryptionPublicKey;
	} else {
		debug('server %s not in registry, attempting auto-discovery', serverUrl);
		try {
			encryptionPublicKey = await discoverAndRegister(serverUrl);
		} catch (err) {
			if (err instanceof DiscoveryError) {
				debug('auto-discovery of %s failed: %s', serverUrl, err.message);
				throw new Error(`Auto-discovery of ${serverUrl} failed: ${err.message}`);
			}
			throw err;
		}
	}

	debug('encrypting payload for %s (key: %s…)', serverUrl, encryptionPublicKey.slice(0, 8));
	const recipientKey = new Uint8Array(Buffer.from(encryptionPublicKey, 'base64'));
	const encrypted = encryptPayload(payload, recipientKey);

	await db.update(deliveryJobs).set({
		lastAttemptedAt: new Date(),
		attempts: job.attemptsMade + 1,
	}).where(eq(deliveryJobs.id, deliveryJobId));

	debug('sending encrypted payload to %s', targetUrl);

	const method = JSON.parse(payload).method;
	if (!method || !["FEDERATE", "INSERT", "UNFOLLOW"].includes(method)) {
		debug('invalid method: %s, dropping job %s', method, job.id);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		debug('job %s dropped because of invalid method', job.id);
		throw new UnrecoverableError(`Invalid method: ${method}, dropping job ${job.id}`);
	}

	const signature = signMessage(payload, getOwnSigningSecretKey());

	const response = await fetch(targetUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Origin': process.env.BETTER_AUTH_URL! },
		body: JSON.stringify({ method, payload: encrypted, signature }),
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		debug('delivery to %s failed with status %d', targetUrl, response.status);
		throw new Error(`Federation delivery to ${targetUrl} failed: ${response.status}`);
	}

	const responseBody = await response.json();

	if (responseBody.status !== "acknowledged") {
		debug('delivery to %s not acknowledged', targetUrl);
		throw new UnrecoverableError(`Federation delivery to ${targetUrl} failed: ${response.status} - ${JSON.stringify(responseBody)}`);
	}

	if (job.name === 'deliver-follow') {
		const followId = JSON.parse(payload).following?.id;
		if (followId && typeof responseBody.accepted === "boolean") {
			await db.update(follows).set({ accepted: responseBody.accepted })
				.where(eq(follows.id, followId));
			debug('updated follow %s accepted=%s', followId, responseBody.accepted);
		}
	}

	debug('job %s delivered successfully to %s', job.id, targetUrl);
}

export function startFederationWorker() {
	createDebug.enable(process.env.DEBUG || '');
	console.log('[federation] Starting worker...');

	const worker = new Worker<FederationDeliveryJob>(
		QUEUE_NAME,
		processFederationDelivery,
		{
			connection: createRedisConnection() as never,
			concurrency: 10,
		},
	);

	worker.on('ready', () => {
		console.log('[federation] Worker connected to Redis and ready');
	});

	worker.on('failed', (job, err) => {
		const retriesLeft = (job?.opts.attempts ?? 0) - (job?.attemptsMade ?? 0);
		debug('job %s (%s) to %s failed (attempt %d, %d retries left): %s', job?.id, job?.name, job?.data.targetUrl, job?.attemptsMade, retriesLeft, err.message);
		if (err.cause) debug('cause: %O', err.cause);
	});

	worker.on('completed', async (job) => {
		debug('job %s (%s) completed, cleaning up delivery record %s', job.id, job.name, job.data.deliveryJobId);
		try {
			await db.delete(deliveryJobs).where(eq(deliveryJobs.id, job.data.deliveryJobId));
		} catch (err) {
			debug('failed to clean up delivery job %s: %O', job.data.deliveryJobId, err);
		}
	});

	worker.on('error', (err) => {
		console.error('[federation] Worker error:', err);
	});

	debug('worker started');
	return worker;
}
