import { config } from "dotenv";
import { createServer } from 'http';
import next from 'next';
import { parse } from 'url';
import SocketManager from "./lib/sockets";
config({ path: '.env.local' });

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
	const nextServer = createServer((req, res) => {
		const parsedUrl = parse(req.url!, true)
		handle(req, res, parsedUrl)
	}).listen(port)

	const socketManager = new SocketManager(nextServer, { requireAuth: true })
	await socketManager.initializeEventHandler()
	console.log(`[SocketManager] Initialized ${socketManager.getSocketIo().engine.clientsCount} clients`)

	console.log(
		`> Server listening at http://localhost:${port} as ${dev ? 'development' : process.env.NODE_ENV
		}`
	)
})