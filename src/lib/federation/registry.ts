import db from '@/lib/db';
import { serverRegistry } from '@/lib/db/schema';
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
	}).onConflictDoNothing();
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
		const res = await fetch(serverUrl + '/discover', {
			signal: AbortSignal.timeout(10_000),
		});
		if (!res.ok) {
			throw new DiscoveryError(`GET /discover returned ${res.status}`);
		}
		remote = await res.json();
	} catch (err) {
		if (err instanceof DiscoveryError) throw err;
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
		await fetch(serverUrl + '/discover', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				method: 'REGISTER',
				url: process.env.BETTER_AUTH_URL!,
				publicKey: process.env.FEDERATION_PUBLIC_KEY!,
				encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
			}),
			signal: AbortSignal.timeout(10_000),
		});
	} catch (err) {
		debug('mutual REGISTER to %s failed (non-fatal): %s', serverUrl, err instanceof Error ? err.message : err);
	}

	debug('auto-discovery of %s complete', serverUrl);
	return remote.encryptionPublicKey;
}
