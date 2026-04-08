// This is to be actually tested, but I'm not sure how to do it without testing it at the battlefield.

import db from '@/lib/db';
import { serverRegistry } from '@/lib/db/schema';
import { FederationError, federationFetch, type FederationErrorCode } from '@/lib/federation/fetch';
import { markServerHealthy } from '@/lib/federation/registry';
import { getThreatPolicy } from '@/lib/federation/threat-model';
import type { Job } from 'bullmq';
import createDebug from 'debug';
import { eq } from 'drizzle-orm';
import { scheduleHealthCheck, type HealthCheckJob } from '../queues';

const debug = createDebug('app:federation:worker');

const MAX_HEALTH_CHECK_ATTEMPTS = 5;

export async function processHealthCheck(job: Job<HealthCheckJob>): Promise<void> {
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
