import { config } from 'dotenv'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import next from 'next'

config({ path: '.env.local' })
const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
	createServer(async (req: IncomingMessage, res: ServerResponse) => {
		handle(req, res)
	}).listen(port)

	console.log(
		`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV
		}`
	)
})