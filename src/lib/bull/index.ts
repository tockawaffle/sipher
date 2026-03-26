import db from '@/lib/db';
import { blacklistedServers, deliveryJobs, follows, serverRegistry } from '@/lib/db/schema';
import { FederationError, federationFetch, type FederationErrorCode } from '@/lib/federation/fetch';
import { encryptPayload, getOwnSigningSecretKey, signMessage, verifySignature } from '@/lib/federation/keytools';
import { discoverAndRegister, DiscoveryError, markServerHealthy } from '@/lib/federation/registry';
import { getThreatPolicy } from '@/lib/federation/threat-model';
import { Queue, UnrecoverableError, Worker, type Job } from 'bullmq';
import createDebug from 'debug';
import { and, eq } from 'drizzle-orm';
import Redis from 'ioredis';
import z from 'zod';
import { FollowEnvelopeSchema } from '../zod/methods/FollowSchema';

const debug = createDebug('app:federation:worker');

// ---------------------------------------------------------------------------
// Shared Redis
// ---------------------------------------------------------------------------

function createRedisConnection() {
	return new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
}

// ---------------------------------------------------------------------------
// Federation delivery queue (existing)
// ---------------------------------------------------------------------------

export interface FederationDeliveryJob {
	deliveryJobId: string;
	targetUrl: string;
	serverUrl: string;
	payload: string;
}

const DELIVERY_QUEUE_NAME = 'federation-delivery';

let _deliveryQueue: Queue<FederationDeliveryJob> | null = null;

export function getFederationQueue(): Queue<FederationDeliveryJob> {
	if (!_deliveryQueue) {
		_deliveryQueue = new Queue<FederationDeliveryJob>(DELIVERY_QUEUE_NAME, {
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
	return _deliveryQueue;
}

// ---------------------------------------------------------------------------
// Health-check queue
// ---------------------------------------------------------------------------

export interface HealthCheckJob {
	serverUrl: string;
}

const HEALTH_CHECK_QUEUE_NAME = 'federation-health-check';

let _healthCheckQueue: Queue<HealthCheckJob> | null = null;

export function getHealthCheckQueue(): Queue<HealthCheckJob> {
	if (!_healthCheckQueue) {
		_healthCheckQueue = new Queue<HealthCheckJob>(HEALTH_CHECK_QUEUE_NAME, {
			connection: createRedisConnection() as never,
		});
	}
	return _healthCheckQueue;
}

export async function scheduleHealthCheck(serverUrl: string, attempt: number): Promise<void> {
	const delayMinutes = 5 + (attempt * 10);
	const delayMs = delayMinutes * 60 * 1000;
	debug('scheduling health check for %s in %d minutes (attempt %d)', serverUrl, delayMinutes, attempt);

	const safeId = serverUrl.replace(/[^a-zA-Z0-9._-]/g, '_');
	await getHealthCheckQueue().add('health-check', { serverUrl }, {
		delay: delayMs,
		jobId: `health-check_${safeId}_${attempt}`,
		removeOnComplete: true,
		removeOnFail: true,
	});
}

// ---------------------------------------------------------------------------
// Delivery worker processor
// ---------------------------------------------------------------------------

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
		.select({ encryptionPublicKey: serverRegistry.encryptionPublicKey, publicKey: serverRegistry.publicKey })
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
	if (!method || !["FEDERATE", "FEDERATE_POST", "INSERT", "UNFOLLOW"].includes(method)) {
		debug('invalid method: %s, dropping job %s', method, job.id);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		debug('job %s dropped because of invalid method', job.id);
		throw new UnrecoverableError(`Invalid method: ${method}, dropping job ${job.id}`);
	}

	const signature = signMessage(payload, getOwnSigningSecretKey());

	const { response } = await federationFetch(targetUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Origin': process.env.BETTER_AUTH_URL!,
			'X-Federation-Origin': process.env.BETTER_AUTH_URL!,
			'X-Federation-Target': targetUrl,
		},
		body: JSON.stringify({ method, payload: encrypted, signature }),
		timeout: 15_000,
		proxyFallback: true,
		serverUrl,
	});

	if (!response.ok) {
		debug('delivery to %s failed with status %d', targetUrl, response.status);
		throw new Error(`Federation delivery to ${targetUrl} failed: ${response.status}`);
	}

	const responseBody = await response.json();
	debug('delivery to %s response body: %o', targetUrl, responseBody);
	debug('responseBody.payload: %s', responseBody.payload);

	const ackPayload =
		responseBody.payload?.method === "PROXY_RESPONSE"
			? responseBody.payload
			: responseBody.method === "PROXY_RESPONSE"
				? responseBody
				: null;

	if (!ackPayload || ackPayload.method !== "PROXY_RESPONSE") {
		debug('delivery to %s not acknowledged', targetUrl);
		throw new UnrecoverableError(`Federation delivery to ${targetUrl} failed: ${response.status} - ${JSON.stringify(responseBody)}`);
	}

	if (job.name === 'deliver-follow') {
		let followPayload: z.infer<typeof FollowEnvelopeSchema>;
		debug('delivery to %s is a follow, updating follow', targetUrl);
		debug('ackPayload: %o', ackPayload);

		if (ackPayload.method === "PROXY_RESPONSE") {
			// Decrypt the payload
			const decrypted = FollowEnvelopeSchema.safeParse(ackPayload.data)
			if (!decrypted.success) {
				debug('failed to parse follow payload: %s', ackPayload.data);
				await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
				throw new UnrecoverableError(`Failed to parse follow payload, dropping job ${job.id}`);
			}

			debug("payload data: %o", decrypted.data);
			// Decrypt the signature
			const signature = verifySignature(decrypted.data._raw, ackPayload.signature, new Uint8Array(Buffer.from(server.publicKey!, 'base64')));

			if (!signature) {
				debug('signature verification failed, dropping job %s', job.id);
				await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
				throw new UnrecoverableError(`Signature verification failed, dropping job ${job.id}`);
			}

			followPayload = decrypted.data as z.infer<typeof FollowEnvelopeSchema>;
		} else {
			const validated = FollowEnvelopeSchema.safeParse(ackPayload);
			if (!validated.success) {
				debug('failed to parse follow payload: %s', ackPayload);
				await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
				throw new UnrecoverableError(`Failed to parse follow payload, dropping job ${job.id}`);
			}

			followPayload = validated.data as z.infer<typeof FollowEnvelopeSchema>;
		}

		const followData = followPayload.following;
		if (followData && followData.accepted) {
			await db.update(follows).set({ accepted: followData.accepted })
				.where(
					and(
						eq(follows.followerId, followData.followerId),
						eq(follows.followingId, followData.followingId),
						eq(follows.followerServerUrl, serverUrl),
					)
				);
			debug('updated follow %s accepted=%s', followData.id, followData.accepted);
		}
	}

	debug('job %s delivered successfully to %s', job.id, targetUrl);
}

// ---------------------------------------------------------------------------
// Health-check worker processor
// ---------------------------------------------------------------------------

const MAX_HEALTH_CHECK_ATTEMPTS = 5;

async function processHealthCheck(job: Job<HealthCheckJob>) {
	const { serverUrl } = job.data;

	const [server] = await db.select()
		.from(serverRegistry)
		.where(eq(serverRegistry.url, serverUrl))
		.limit(1);

	if (!server) {
		debug('health-check: server %s not found in registry, skipping', serverUrl);
		return;
	}

	if (server.isHealthy) {
		debug('health-check: server %s is already healthy, skipping', serverUrl);
		return;
	}

	if (server.unhealthyReason) {
		const policy = getThreatPolicy(server.unhealthyReason as FederationErrorCode);
		if (!policy.directHealthCheckable) {
			debug('health-check: server %s has reason %s (not direct-checkable), skipping', serverUrl, server.unhealthyReason);
			return;
		}
	}

	debug('health-check: pinging %s (attempt %d/%d)', serverUrl, server.healthCheckAttempts + 1, MAX_HEALTH_CHECK_ATTEMPTS);

	try {
		const { response } = await federationFetch(serverUrl + '/discover', {
			serverUrl,
			timeout: 8_000,
			skipHealthUpdate: true,
		});

		if (response.ok) {
			debug('health-check: %s is reachable, marking healthy', serverUrl);
			await markServerHealthy(serverUrl);
			return;
		}

		debug('health-check: %s returned HTTP %d', serverUrl, response.status);
	} catch (err) {
		debug('health-check: %s failed: %s', serverUrl, err instanceof FederationError ? err.code : err);
	}

	const nextAttempt = server.healthCheckAttempts + 1;
	await db.update(serverRegistry).set({
		healthCheckAttempts: nextAttempt,
		updatedAt: new Date(),
	}).where(eq(serverRegistry.url, serverUrl));

	if (nextAttempt < MAX_HEALTH_CHECK_ATTEMPTS) {
		await scheduleHealthCheck(serverUrl, nextAttempt);
	} else {
		debug('health-check: %s exhausted all %d attempts, stopping', serverUrl, MAX_HEALTH_CHECK_ATTEMPTS);
		console.warn(`[federation] health-check exhausted for ${serverUrl} after ${MAX_HEALTH_CHECK_ATTEMPTS} attempts`);
	}
}

// ---------------------------------------------------------------------------
// Worker startup
// ---------------------------------------------------------------------------

export function startFederationWorker() {
	createDebug.enable(process.env.DEBUG || '');
	console.log('[federation] Starting workers...');

	const deliveryWorker = new Worker<FederationDeliveryJob>(
		DELIVERY_QUEUE_NAME,
		processFederationDelivery,
		{
			connection: createRedisConnection() as never,
			concurrency: 10,
		},
	);

	deliveryWorker.on('ready', () => {
		console.log('[federation] Delivery worker connected to Redis and ready');
	});

	deliveryWorker.on('failed', (job, err) => {
		const retriesLeft = (job?.opts.attempts ?? 0) - (job?.attemptsMade ?? 0);
		debug('delivery job %s (%s) to %s failed (attempt %d, %d retries left): %s', job?.id, job?.name, job?.data.targetUrl, job?.attemptsMade, retriesLeft, err.message);
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
			connection: createRedisConnection() as never,
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

	debug('all workers started');
	return { deliveryWorker, healthCheckWorker };
}
