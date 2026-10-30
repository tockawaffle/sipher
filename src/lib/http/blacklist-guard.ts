import { isBlacklisted } from '@/lib/federation/blacklist-middleware'
import { Elysia } from 'elysia'

// Under no circumstances a blacklisted server should be able to access anything from this federation server.
// This is a security measure to isolate the federation server from potentially malicious servers.
// This could and should be revised in the future.
export const blacklistGuard = new Elysia({ name: 'sipher-blacklist' }).onRequest(async ({ request }) => {
	const ownUrl = process.env.BETTER_AUTH_URL

	// If coming from self, skip
	if (
		request.headers.get('x-federation-origin') === ownUrl ||
		request.headers.get('origin') === ownUrl
	) {
		return
	}

	const candidates: string[] = []

	const origin = request.headers.get('origin')
	if (origin) candidates.push(origin)

	const federationOrigin = request.headers.get('x-federation-origin')
	if (federationOrigin) candidates.push(federationOrigin)

	const method = request.method.toUpperCase()
	if (['POST', 'PUT', 'PATCH'].includes(method)) {
		const contentType = request.headers.get('content-type') ?? ''
		if (contentType.includes('application/json')) {
			try {
				const body = await request.clone().json()
				if (typeof body.url === 'string') candidates.push(body.url)
				if (typeof body.serverUrl === 'string') candidates.push(body.serverUrl)
			} catch {
				// Invalid JSON, let the route handler deal with it
			}
		}
	}

	for (const url of candidates) {
		if (await isBlacklisted(url)) {
			return Response.json({ error: 'Your server has been blacklisted.', code: 'BLACKLISTED_FEDERATION_SERVER' }, { status: 403 })
		}
	}
})
