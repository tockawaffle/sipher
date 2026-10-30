import db from '@/lib/db';
import { blacklistedServers, serverRegistry } from '@/lib/db/schema';
import { encryptPayload, getOwnSigningSecretKey, signMessage } from '@/lib/federation/keytools';
import { markServerHealthy, markServerRecovered, markServerUnhealthy } from '@/lib/federation/registry';
import { EMERGENCY_SWEEP_TIMEOUT, getThreatPolicy } from '@/lib/federation/threat-model';
import { assertSafeAddress, UrlGuardError } from '@/lib/federation/url-guard';
import createDebug from 'debug';
import { and, desc, eq, ne, notExists, notInArray } from 'drizzle-orm';

const debug = createDebug('app:federation:fetch');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FederationErrorCode =
	| "DNS_BLOCKED"
	| "CONN_REFUSED"
	| "CONN_RESET"
	| "TIMEOUT"
	| "TLS_ERROR"
	| "INVALID_RESPONSE_FROM_TARGET"
	| "UNKNOWN";

export class FederationError extends Error {
	constructor(
		public readonly code: FederationErrorCode,
		public readonly url: string,
	) {
		super(`Federation unreachable: ${code} — ${url}`);
		this.name = 'FederationError';
	}

	get isProxyEligible(): boolean {
		return getThreatPolicy(this.code).proxyEligible;
	}
}

export interface FederationFetchOptions {
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	timeout?: number;
	proxyFallback?: boolean;
	serverUrl?: string;
	skipHealthUpdate?: boolean;
}

export interface FederationFetchResult {
	response: Response;
	proxied: boolean;
	proxyPeer?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractServerUrl(fullUrl: string, explicit?: string): string {
	if (explicit) return explicit;
	const parsed = new URL(fullUrl);
	return `${parsed.protocol}//${parsed.host}`;
}

function classifyError(err: unknown, url: string): FederationError {
	const anyErr = err as Record<string, any> | undefined;
	const code = anyErr?.cause?.code ?? anyErr?.code ?? '';

	if (anyErr?.name === 'AbortError' || anyErr?.name === 'TimeoutError') {
		return new FederationError('TIMEOUT', url);
	}
	if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
		return new FederationError('DNS_BLOCKED', url);
	}
	if (code === 'ECONNREFUSED') {
		return new FederationError('CONN_REFUSED', url);
	}
	if (code === 'ECONNRESET' || code === 'ETIMEDOUT') {
		return new FederationError('CONN_RESET', url);
	}
	if (typeof code === 'string' && (
		code.startsWith('ERR_TLS') ||
		code.startsWith('ERR_SSL') ||
		code.startsWith('CERT_') ||
		code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
		code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
		code === 'SELF_SIGNED_CERT_IN_CHAIN'
	)) {
		return new FederationError('TLS_ERROR', url);
	}
	return new FederationError('UNKNOWN', url);
}

/**
 * Refuses internal addresses (UrlGuardError). A failed DNS lookup is a
 * FederationError like any other network failure, so it can go to a proxy.
 */
async function guardAddress(url: string): Promise<void> {
	try {
		await assertSafeAddress(url);
	} catch (err) {
		if (err instanceof UrlGuardError) throw err;
		throw classifyError(err, url);
	}
}

async function directFetch(url: string, opts: FederationFetchOptions): Promise<Response> {
	await guardAddress(url);

	const controller = new AbortController();
	const timeout = opts.timeout ?? 10_000;
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			method: opts.method ?? 'GET',
			headers: opts.headers,
			body: opts.body,
			signal: controller.signal,
			// A redirect could point at an internal address the guard never saw.
			redirect: 'manual',
		});
		clearTimeout(timer);
		return response;
	} catch (err) {
		clearTimeout(timer);
		throw classifyError(err, url);
	}
}

// ---------------------------------------------------------------------------
// Proxy peer selection & emergency sweep
// ---------------------------------------------------------------------------

type RegistryRow = typeof serverRegistry.$inferSelect;

/** How many healthy peers one federationFetch call tries before giving up on proxying. */
const MAX_PROXY_ATTEMPTS = 3;

/** Excludes peers we blacklisted: they must never carry our traffic. */
const notBlacklisted = notExists(
	db.select({ id: blacklistedServers.id })
		.from(blacklistedServers)
		.where(eq(blacklistedServers.serverUrl, serverRegistry.url)),
);

async function pickHealthyProxies(excludeUrls: string[], limit: number): Promise<RegistryRow[]> {
	const ownUrl = process.env.BETTER_AUTH_URL!;
	return await db.select()
		.from(serverRegistry)
		.where(
			and(
				eq(serverRegistry.isHealthy, true),
				notInArray(serverRegistry.url, [...excludeUrls, ownUrl]),
				notBlacklisted,
			),
		)
		.orderBy(desc(serverRegistry.lastSeen))
		.limit(limit);
}

async function emergencySweep(excludeUrls: string[]): Promise<RegistryRow | null> {
	debug('emergency sweep: pinging all unhealthy servers');
	const ownUrl = process.env.BETTER_AUTH_URL!;

	// Every unhealthy peer is pinged, whatever the reason it was marked: a
	// censorship block can lift at any time and the ping is cheap.
	const checkable = await db.select()
		.from(serverRegistry)
		.where(
			and(
				eq(serverRegistry.isHealthy, false),
				notInArray(serverRegistry.url, [...excludeUrls, ownUrl]),
				notBlacklisted,
			),
		)
		.orderBy(desc(serverRegistry.lastSeen));

	if (checkable.length === 0) {
		debug('emergency sweep: no unhealthy servers to ping');
		return null;
	}

	debug('emergency sweep: pinging %d servers in parallel (timeout %dms)', checkable.length, EMERGENCY_SWEEP_TIMEOUT);

	const results = await Promise.allSettled(
		checkable.map(async (server) => {
			try {
				await guardAddress(server.url);
			} catch (err) {
				if (err instanceof UrlGuardError) {
					debug('emergency sweep: skipping %s — blocked URL: %s', server.url, err.message);
				}
				throw err;
			}
			const res = await fetch(server.url + '/discover', {
				signal: AbortSignal.timeout(EMERGENCY_SWEEP_TIMEOUT),
				redirect: 'manual',
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return server;
		}),
	);

	const recovered: RegistryRow[] = [];
	for (const result of results) {
		if (result.status === 'fulfilled') {
			recovered.push(result.value);
		}
	}

	if (recovered.length === 0) {
		debug('emergency sweep: no servers recovered — federation is STRANDED');
		console.error('[federation] STRANDED: all known peers are unreachable. Inbound registration is the only recovery path.');
		return null;
	}

	debug('emergency sweep: %d server(s) recovered', recovered.length);
	for (const server of recovered) {
		await markServerHealthy(server.url);
	}

	return recovered[0];
}

// ---------------------------------------------------------------------------
// Proxy routing
// ---------------------------------------------------------------------------

/** The proxy itself could not be reached, as opposed to the proxy failing to reach the target. */
class ProxyUnreachableError extends Error {
	constructor(public readonly failure: FederationError) {
		super(`Proxy unreachable: ${failure.code} — ${failure.url}`);
		this.name = 'ProxyUnreachableError';
	}
}

async function attemptProxyRoute(
	url: string,
	opts: FederationFetchOptions,
	targetServerUrl: string,
	proxyPeer: RegistryRow,
): Promise<FederationFetchResult> {
	debug('proxy route: sending through %s → %s', proxyPeer.url, targetServerUrl);

	const [targetServer] = await db.select()
		.from(serverRegistry)
		.where(eq(serverRegistry.url, targetServerUrl))
		.limit(1);

	if (!targetServer) {
		throw new Error(`Target server ${targetServerUrl} not found in registry for proxy routing`);
	}

	const recipientKey = new Uint8Array(Buffer.from(targetServer.encryptionPublicKey, 'base64'));
	const innerPayload = JSON.stringify({
		targetUrl: url,
		method: opts.method ?? 'GET',
		headers: opts.headers ?? {},
		body: opts.body ?? null,
	});

	const encrypted = encryptPayload(innerPayload, recipientKey);
	const signature = signMessage(innerPayload, getOwnSigningSecretKey());

	const proxyUrl = proxyPeer.url + '/proxy';
	const proxyBody = JSON.stringify({
		method: 'PROXY',
		targetUrl: targetServerUrl + '/proxy',
		publicSigningKey: process.env.FEDERATION_PUBLIC_KEY!,
		publicEncryptionKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
		payload: encrypted,
		signature,
	});

	let proxyResponse: Response;
	try {
		await guardAddress(proxyUrl).catch(err => {
			if (err instanceof UrlGuardError) throw new ProxyUnreachableError(new FederationError('UNKNOWN', proxyUrl));
			throw err;
		});
		proxyResponse = await fetch(proxyUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Federation-Origin': process.env.BETTER_AUTH_URL!,
				'Origin': process.env.BETTER_AUTH_URL!,
			},
			body: proxyBody,
			signal: AbortSignal.timeout(opts.timeout ?? 15_000),
			redirect: 'manual',
		});
	} catch (err) {
		if (err instanceof ProxyUnreachableError) throw err;
		throw new ProxyUnreachableError(err instanceof FederationError ? err : classifyError(err, proxyUrl));
	}

	if (!proxyResponse.ok) {
		if (proxyResponse.status === 502) {
			throw new FederationError("INVALID_RESPONSE_FROM_TARGET", proxyPeer.url);
		}
		throw new Error(`Proxy ${proxyPeer.url} returned ${proxyResponse.status}`);
	}

	return { response: proxyResponse, proxied: true, proxyPeer: proxyPeer.url };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function federationFetch(
	url: string,
	opts: FederationFetchOptions = {},
): Promise<FederationFetchResult> {
	const serverUrl = extractServerUrl(url, opts.serverUrl);

	// Gate 0: direct fetch
	try {
		const response = await directFetch(url, opts);
		if (!opts.skipHealthUpdate) {
			// A direct success is the strongest signal that a block has lifted.
			await markServerRecovered(serverUrl).catch(e =>
				debug('failed to mark %s recovered: %O', serverUrl, e),
			);
		}
		return { response, proxied: false };
	} catch (err) {
		if (!(err instanceof FederationError)) throw err;

		debug('direct fetch to %s failed: %s', url, err.code);

		if (!opts.skipHealthUpdate) {
			await markServerUnhealthy(serverUrl, err.code).catch(e =>
				debug('failed to mark %s unhealthy: %O', serverUrl, e),
			);
		}

		const policy = getThreatPolicy(err.code);

		// Gate 1: proxy fallback
		if (opts.proxyFallback && policy.proxyEligible) {
			const tried = [serverUrl];

			const tryProxy = async (peer: RegistryRow): Promise<FederationFetchResult | null> => {
				tried.push(peer.url);
				try {
					return await attemptProxyRoute(url, opts, serverUrl, peer);
				} catch (proxyErr) {
					debug('proxy route through %s failed: %O', peer.url, proxyErr);
					// Only blame the proxy when we could not reach it. A proxy that
					// answered but could not reach the target is still healthy.
					if (proxyErr instanceof ProxyUnreachableError && !opts.skipHealthUpdate) {
						await markServerUnhealthy(peer.url, proxyErr.failure.code).catch(e =>
							debug('failed to mark proxy %s unhealthy: %O', peer.url, e),
						);
					}
					return null;
				}
			};

			for (const peer of await pickHealthyProxies(tried, MAX_PROXY_ATTEMPTS)) {
				const result = await tryProxy(peer);
				if (result) return result;
			}

			// No healthy proxy worked. Ping the unhealthy ones in case a block lifted.
			const recovered = await emergencySweep(tried);
			if (recovered) {
				const result = await tryProxy(recovered);
				if (result) return result;
			} else if (tried.length === 1) {
				throw new Error("No healthy proxy found. Emergency sweep failed.");
			}
		}

		throw err;
	}
}
