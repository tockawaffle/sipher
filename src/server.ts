import { config } from 'dotenv'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import next from 'next'
import { Server } from 'socket.io'

config({ path: '.env.local' })

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

// ---------------------------------------------------------------------------
// Rate-limit enforcement
// Imported lazily after app.prepare() so Redis is initialised in the same
// event-loop tick as the rest of the server setup.
// ---------------------------------------------------------------------------

async function applyRateLimit(
	req: IncomingMessage,
): Promise<{ retryAfter: number } | null> {
	const { RATE_LIMIT_ROUTES } = await import('./lib/rate-limit/rate-limit-config')
	const { checkRateLimit } = await import('./lib/rate-limit/rate-limit')

	const pathname = (req.url ?? '/').split('?')[0]
	const method = req.method?.toUpperCase() ?? 'GET'

	const rule = RATE_LIMIT_ROUTES[pathname]
	if (!rule) return null
	if (rule.methods && !rule.methods.includes(method)) return null

	const forwarded = req.headers['x-forwarded-for']
	const ip =
		(Array.isArray(forwarded) ? forwarded[0] : forwarded)
			?.split(',')[0]
			?.trim() ?? req.socket.remoteAddress ?? 'unknown'

	const result = await checkRateLimit(`${pathname}:${ip}`, rule)
	if (!result.allowed) return { retryAfter: result.retryAfter }
	return null
}

app.prepare().then(async () => {
	const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		try {
			const limited = await applyRateLimit(req)
			if (limited) {
				const body = JSON.stringify({ error: 'Too many requests. Please try again later.' })
				res.writeHead(429, {
					'Content-Type': 'application/json',
					'Retry-After': String(limited.retryAfter),
					'Content-Length': Buffer.byteLength(body),
				})
				res.end(body)
				return
			}
		} catch (err) {
			// Rate-limit failures are non-fatal — let the request through
			// rather than blocking legitimate traffic due to a Redis hiccup.
			console.error('[rate-limit] middleware error (passing through):', err)
		}

		handle(req, res)
	})

	const io = new Server(server)

	io.on('connection', (socket) => {
		socket.on('join-firehose', () => socket.join('firehose'))
		socket.on('leave-firehose', () => socket.leave('firehose'))
	})

	server.listen(port)

	console.log(
		`> Server listening at ${process.env.BETTER_AUTH_URL!} as ${dev ? 'development' : process.env.NODE_ENV}`,
	)
})
