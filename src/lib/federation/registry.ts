import db from '@/lib/db';
import { serverRegistry } from '@/lib/db/schema';
import { federationFetch, FederationError, type FederationErrorCode } from '@/lib/federation/fetch';
import { assertSafeUrl } from '@/lib/federation/url-guard';
import createDebug from 'debug';
import { eq } from 'drizzle-orm';

const debug = createDebug('app:federation:registry');

export async function upsertServer(url: string, publicKey: string, encryptionPublicKey: string) {
	return await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url,
		publicKey,
		encryptionPublicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
		healthCheckAttempts: 0,
		unhealthyReason: null,
	}).onConflictDoUpdate({
		target: serverRegistry.url,
		set: {
			lastSeen: new Date(),
			updatedAt: new Date(),
		},
	});
}

export async function markServerUnhealthy(serverUrl: string, reason: FederationErrorCode): Promise<void> {
	debug('marking server %s as unhealthy (reason: %s)', serverUrl, reason);
	await db.update(serverRegistry).set({
		isHealthy: false,
		unhealthyReason: reason,
		healthCheckAttempts: 0,
		updatedAt: new Date(),
	}).where(eq(serverRegistry.url, serverUrl));

	try {
		const { scheduleHealthCheck } = await import('@/lib/bull');
		await scheduleHealthCheck(serverUrl, 0);
	} catch (err) {
		debug('failed to schedule health check for %s: %O', serverUrl, err);
	}
}

export async function markServerHealthy(serverUrl: string): Promise<void> {
	debug('marking server %s as healthy', serverUrl);
	await db.update(serverRegistry).set({
		isHealthy: true,
		unhealthyReason: null,
		healthCheckAttempts: 0,
		lastSeen: new Date(),
		updatedAt: new Date(),
	}).where(eq(serverRegistry.url, serverUrl));
}

export class DiscoveryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DiscoveryError';
	}
}

/**
 * Fetches a remote server's /discover endpoint, registers it locally,
 * and POSTs our own info so the remote registers us back (mutual registration).
 * Returns the remote server's encryptionPublicKey on success.
 */
export async function discoverAndRegister(serverUrl: string): Promise<string> {
	debug('auto-discovering server %s', serverUrl);

	assertSafeUrl(serverUrl);

	let remote: { url?: string; publicKey?: string; encryptionPublicKey?: string };
	try {
		const { response } = await federationFetch(serverUrl + '/discover', {
			serverUrl,
		});
		if (!response.ok) {
			throw new DiscoveryError(`GET /discover returned ${response.status}`);
		}
		remote = await response.json();
	} catch (err) {
		if (err instanceof DiscoveryError) throw err;
		if (err instanceof FederationError) {
			throw new DiscoveryError(`Failed to reach ${serverUrl}/discover: ${err.code}`);
		}
		throw new DiscoveryError(`Failed to reach ${serverUrl}/discover: ${err instanceof Error ? err.message : err}`);
	}

	if (!remote.publicKey || !remote.encryptionPublicKey) {
		throw new DiscoveryError(`Server ${serverUrl} returned incomplete keys`);
	}

	const existing = await db
		.select({ publicKey: serverRegistry.publicKey })
		.from(serverRegistry)
		.where(eq(serverRegistry.url, serverUrl))
		.limit(1);

	if (existing.length > 0 && existing[0].publicKey !== remote.publicKey) {
		throw new DiscoveryError(
			`Server ${serverUrl} presented a different public key than what we have on record. ` +
			`This may indicate a key rotation issue or a compromised server.`,
		);
	}

	debug('registering remote server %s locally', serverUrl);
	await upsertServer(serverUrl, remote.publicKey, remote.encryptionPublicKey);

	debug('sending mutual REGISTER to %s', serverUrl);
	try {
		await federationFetch(serverUrl + '/discover', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				method: 'REGISTER',
				url: process.env.BETTER_AUTH_URL!,
				publicKey: process.env.FEDERATION_PUBLIC_KEY!,
				encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
			}),
			serverUrl,
		});
	} catch (err) {
		debug('mutual REGISTER to %s failed (non-fatal): %s', serverUrl, err instanceof Error ? err.message : err);
	}

	debug('auto-discovery of %s complete', serverUrl);
	return remote.encryptionPublicKey;
}
