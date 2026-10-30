import { checkRateLimit } from '@/lib/rate-limit/rate-limit'
import { RATE_LIMIT_ROUTES } from '@/lib/rate-limit/rate-limit-config'
import { Elysia } from 'elysia'

/**
 * Per-IP rate limiting for the routes listed in `RATE_LIMIT_ROUTES`.
 * Runs in `onRequest`, before routing and body parsing.
 */
export const rateLimitGuard = new Elysia({ name: 'sipher-rate-limit' }).onRequest(
	async ({ request, server }) => {
		try {
			const pathname = new URL(request.url).pathname
			const method = request.method.toUpperCase()

			const rule = RATE_LIMIT_ROUTES[pathname]
			if (!rule) return
			if (rule.methods && !rule.methods.includes(method)) return

			const forwarded = request.headers.get('x-forwarded-for')
			const ip =
				forwarded?.split(',')[0]?.trim() ||
				server?.requestIP(request)?.address ||
				'unknown'

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
