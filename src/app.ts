import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { auth } from './lib/auth'
import { blacklistGuard } from './lib/http/blacklist-guard'
import { rateLimitGuard } from './lib/http/rate-limit-guard'
import { realtime } from './lib/realtime'
import { POST as relayDiscover } from './routes/dev/relay-discover'
import { GET as discoverGet, POST as discoverPost } from './routes/discover'
import { POST as rotateConfirm } from './routes/discover/rotate/confirm'
import { POST as rotateInit } from './routes/discover/rotate/init'
import { GET as mediaGet } from './routes/media'
import { POST as proxyPost } from './routes/proxy'

/**
 * Builds the SiPher API. Kept separate from `server.ts` so tests can call
 * `createApp().handle(request)` without binding a port or starting workers.
 *
 * Route handlers under `src/routes` are plain `(Request) => Promise<Response>`
 * functions; they parse their own bodies, so every route here uses
 * `parse: 'none'` to hand them an untouched request.
 */
export function createApp() {
	const corsOrigins = process.env.CORS_ORIGINS
		?.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean)

	return new Elysia()
		.use(rateLimitGuard)
		.use(blacklistGuard)
		.use(
			cors({
				origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
				methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
				credentials: true,
				allowedHeaders: ['Content-Type', 'Authorization', 'X-Federation-Origin'],
			}),
		)
		.use(openapi({ path: '/openapi' }))
		.mount(auth.handler)
		.use(realtime)
		.get('/', () => ({ name: 'sipher', status: 'ok' }))
		.get('/discover', () => discoverGet())
		.post('/discover', ({ request }) => discoverPost(request), { parse: 'none' })
		.post('/discover/rotate/init', ({ request }) => rotateInit(request), { parse: 'none' })
		.post('/discover/rotate/confirm', ({ request }) => rotateConfirm(request), { parse: 'none' })
		.post('/proxy', ({ request }) => proxyPost(request), { parse: 'none' })
		.post('/api/dev/relay-discover', ({ request }) => relayDiscover(request), { parse: 'none' })
		.get('/media/*', ({ params }) => mediaGet(params['*']))
		.get('/logo/*', ({ params }) => {
			const name = params['*']
			if (name.includes('..')) return new Response('Not found', { status: 404 })
			return Bun.file(`public/logo/${name}`)
		})
}

export type App = ReturnType<typeof createApp>
