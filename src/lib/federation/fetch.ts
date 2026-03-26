import db from '@/lib/db';
import { serverRegistry } from '@/lib/db/schema';
import { encryptPayload, getOwnSigningSecretKey, signMessage } from '@/lib/federation/keytools';
import { markServerHealthy, markServerUnhealthy } from '@/lib/federation/registry';
import { EMERGENCY_SWEEP_TIMEOUT, getThreatPolicy } from '@/lib/federation/threat-model';
import createDebug from 'debug';
import { and, desc, eq, ne } from 'drizzle-orm';

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

async function directFetch(url: string, opts: FederationFetchOptions): Promise<Response> {
	const controller = new AbortController();
	const timeout = opts.timeout ?? 10_000;
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const response = await fetch(url, {
			method: opts.method ?? 'GET',
			headers: opts.headers,
			body: opts.body,
			signal: controller.signal,
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

async function pickHealthyProxy(excludeUrl: string): Promise<typeof serverRegistry.$inferSelect | null> {
	const ownUrl = process.env.BETTER_AUTH_URL!;
	const [peer] = await db.select()
		.from(serverRegistry)
		.where(
			and(
				eq(serverRegistry.isHealthy, true),
				ne(serverRegistry.url, excludeUrl),
				ne(serverRegistry.url, ownUrl),
			),
		)
		.orderBy(desc(serverRegistry.lastSeen))
		.limit(1);

	return peer ?? null;
}

async function emergencySweep(excludeUrl: string): Promise<typeof serverRegistry.$inferSelect | null> {
	debug('emergency sweep: pinging all unhealthy servers');
	const ownUrl = process.env.BETTER_AUTH_URL!;

	const unhealthyServers = await db.select()
		.from(serverRegistry)
		.where(
			and(
				eq(serverRegistry.isHealthy, false),
				ne(serverRegistry.url, excludeUrl),
				ne(serverRegistry.url, ownUrl),
			),
		)
		.orderBy(desc(serverRegistry.lastSeen));

	const checkable = unhealthyServers.filter(s => {
		if (!s.unhealthyReason) return true;
		const policy = getThreatPolicy(s.unhealthyReason as FederationErrorCode);
		return policy.directHealthCheckable;
	});

	if (checkable.length === 0) {
		debug('emergency sweep: no direct-checkable servers');
		return null;
	}

	debug('emergency sweep: pinging %d servers in parallel (timeout %dms)', checkable.length, EMERGENCY_SWEEP_TIMEOUT);

	const results = await Promise.allSettled(
		checkable.map(async (server) => {
			const res = await fetch(server.url + '/discover', {
				signal: AbortSignal.timeout(EMERGENCY_SWEEP_TIMEOUT),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return server;
		}),
	);

	const recovered: (typeof serverRegistry.$inferSelect)[] = [];
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

async function attemptProxyRoute(
	url: string,
	opts: FederationFetchOptions,
	targetServerUrl: string,
	proxyPeer: typeof serverRegistry.$inferSelect,
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

	const proxyResponse = await fetch(proxyUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Federation-Origin': process.env.BETTER_AUTH_URL!,
			'Origin': process.env.BETTER_AUTH_URL!,
		},
		body: proxyBody,
		signal: AbortSignal.timeout(opts.timeout ?? 15_000),
	});

	if (!proxyResponse.ok) {
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
			let proxyPeer = await pickHealthyProxy(serverUrl);

			// If no healthy proxy is found, we'll do an emergency sweep to find a new proxy.
			if (!proxyPeer) {
				proxyPeer = await emergencySweep(serverUrl);
			}

			if (proxyPeer) {
				try {
					return await attemptProxyRoute(url, opts, serverUrl, proxyPeer);
				} catch (proxyErr) {
					debug('proxy route through %s failed: %O', proxyPeer.url, proxyErr);
				}
			} else {
				throw new Error("No healthy proxy found. Emergency sweep failed.");
			}
		}

		throw err;
	}
}
