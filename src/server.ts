import { config } from 'dotenv'

// Load env before anything that reads process.env at import time (auth, url-guard, rate-limit config).
config({ path: '.env.local' })

const { createApp } = await import('./app')
const { startFederationWorker } = await import('./lib/bull/worker')

const port = parseInt(process.env.PORT || '3000', 10)
const app = createApp().listen(port)

startFederationWorker()

console.log(
	`> Server listening at ${process.env.BETTER_AUTH_URL!} (port ${app.server?.port}) as ${process.env.NODE_ENV ?? 'development'}`,
)
