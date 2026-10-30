import { checkRateLimit } from '@/lib/rate-limit/rate-limit'
import { RATE_LIMIT_ROUTES } from '@/lib/rate-limit/rate-limit-config'
import { Elysia } from 'elysia'

/**
 * Number of reverse proxies in front of this server that append to
 * `X-Forwarded-For`. With 0 (the default) the header is ignored, since any
 * client can set it to dodge the limit.
 */
const TRUSTED_PROXY_HOPS = Math.max(0, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10) || 0)

/**
 * The client address as seen by the first trusted proxy: the entry that many
 * hops from the right of `X-Forwarded-For`. Entries further left were written
 * by the client and cannot be trusted.
 */
function clientIp(request: Request, socketIp: string | undefined): string {
	if (TRUSTED_PROXY_HOPS > 0) {
		const hops = (request.headers.get('x-forwarded-for') ?? '')
			.split(',')
			.map((h) => h.trim())
			.filter(Boolean)
		const ip = hops[hops.length - TRUSTED_PROXY_HOPS]
		if (ip) return ip
	}
	return socketIp ?? 'unknown'
}

/**
 * Per-IP rate limiting for the routes listed in `RATE_LIMIT_ROUTES`.
 * Runs in `onRequest`, before routing and body parsing.
 */
export const rateLimitGuard = new Elysia({ name: 'sipher-rate-limit' }).onRequest(
	async ({ request, server }) => {
		try {
			// Elysia routes `/discover/` to `/discover`, so match rules without the trailing slash.
			const rawPath = new URL(request.url).pathname
			const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath
			const method = request.method.toUpperCase()

			const rule = RATE_LIMIT_ROUTES[pathname]
			if (!rule) return
			if (rule.methods && !rule.methods.includes(method)) return

			const ip = clientIp(request, server?.requestIP(request)?.address)

			const result = await checkRateLimit(`${pathname}:${ip}`, rule)
			if (!result.allowed) {
				return Response.json(
					{ error: 'Too many requests. Please try again later.' },
					{ status: 429, headers: { 'Retry-After': String(result.retryAfter) } },
				)
			}
		} catch (err) {
			// Rate-limit failures are non-fatal — let the request through
			// rather than blocking legitimate traffic due to a Redis hiccup.
			console.error('[rate-limit] middleware error (passing through):', err)
		}
	},
)
