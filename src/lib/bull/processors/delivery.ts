import db from '@/lib/db';
import { blacklistedServers, deliveryJobs, serverRegistry } from '@/lib/db/schema';
import { federationFetch } from '@/lib/federation/fetch';
import { encryptPayload, getOwnSigningSecretKey, signMessage } from '@/lib/federation/keytools';
import { discoverAndRegister, DiscoveryError } from '@/lib/federation/registry';
import type { FederationDeliveryJob } from '../queues';
import { handleFollowAck } from './handlers/follow';
import { UnrecoverableError, type Job } from 'bullmq';
import createDebug from 'debug';
import { eq } from 'drizzle-orm';

const debug = createDebug('app:federation:worker');

const ALLOWED_METHODS = new Set(['FEDERATE', 'FEDERATE_POST', 'INSERT', 'UNFOLLOW']);

// ---------------------------------------------------------------------------
// Ack handlers keyed by job name
// ---------------------------------------------------------------------------

type AckPayload = { method: 'PROXY_RESPONSE'; data: unknown; signature: string };

type AckHandler = (
	ackPayload: AckPayload,
	serverUrl: string,
	serverPublicKey: string | undefined,
	deliveryJobId: string,
	jobId: string | undefined,
) => Promise<void>;

const ackHandlers: Record<string, AckHandler> = {
	'deliver-follow': handleFollowAck,
};

// ---------------------------------------------------------------------------
// Main processor
// ---------------------------------------------------------------------------

export async function processFederationDelivery(job: Job<FederationDeliveryJob>): Promise<void> {
	const { deliveryJobId, targetUrl, serverUrl, payload } = job.data;
	debug('processing job %s (%s) → %s (attempt %d)', job.id, job.name, targetUrl, job.attemptsMade + 1);

	// 1. Validate method early — before any I/O.
	let method: string;
	try {
		method = JSON.parse(payload).method;
	} catch {
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		throw new UnrecoverableError(`Malformed payload JSON, dropping job ${job.id}`);
	}

	if (!method || !ALLOWED_METHODS.has(method)) {
		debug('invalid method: %s, dropping job %s', method, job.id);
		await db.delete(deliveryJobs).where(eq(deliveryJobs.id, deliveryJobId));
		throw new UnrecoverableError(`Invalid method: ${method}, dropping job ${job.id}`);
	}

	// 2. Blacklist check.
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

	// 3. Resolve encryption key (and keep the full server row for later).
	let encryptionPublicKey: string;
	let serverPublicKey: string | undefined;

	const [server] = await db
		.select({
			encryptionPublicKey: serverRegistry.encryptionPublicKey,
			publicKey: serverRegistry.publicKey,
		})
		.from(serverRegistry)
		.where(eq(serverRegistry.url, serverUrl))
		.limit(1);

	if (server) {
		encryptionPublicKey = server.encryptionPublicKey;
		serverPublicKey = server.publicKey;
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
		// serverPublicKey stays undefined; follow handler will re-fetch it.
	}

	// 4. Encrypt payload and record the attempt.
	debug('encrypting payload for %s (key: %s…)', serverUrl, encryptionPublicKey.slice(0, 8));
	const recipientKey = new Uint8Array(Buffer.from(encryptionPublicKey, 'base64'));
	const encrypted = encryptPayload(payload, recipientKey);

	await db.update(deliveryJobs).set({
		lastAttemptedAt: new Date(),
		attempts: job.attemptsMade + 1,
	}).where(eq(deliveryJobs.id, deliveryJobId));

	// 5. Send.
	debug('sending encrypted payload to %s', targetUrl);
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

	// 6. Parse ack.
	const responseBody = await response.json();
	debug('delivery to %s response body: %o', targetUrl, responseBody);

	const ackPayload: AckPayload | null =
		responseBody.payload?.method === 'PROXY_RESPONSE'
			? responseBody.payload
			: responseBody.method === 'PROXY_RESPONSE'
				? responseBody
				: null;

	if (!ackPayload) {
		debug('delivery to %s not acknowledged', targetUrl);
		throw new UnrecoverableError(
			`Federation delivery to ${targetUrl} not acknowledged: ${JSON.stringify(responseBody)}`,
		);
	}

	// 7. Dispatch to job-specific ack handler (if any).
	const handleAck = ackHandlers[job.name];
	if (handleAck) {
		await handleAck(ackPayload, serverUrl, serverPublicKey, deliveryJobId, job.id);
	} else {
		debug('job %s has no ack handler, skipping ack processing', job.name);
	}

	debug('job %s delivered successfully to %s', job.id, targetUrl);
}
