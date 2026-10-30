import { Elysia, t } from 'elysia'

export const FIREHOSE_TOPIC = 'firehose'

/**
 * Real-time channel over Bun's native WebSocket pub/sub (replaces Socket.IO).
 *
 * Clients connect to `/ws` and send `{ "type": "join-firehose" }` or
 * `{ "type": "leave-firehose" }`. Server code publishes with
 * `app.server.publish(FIREHOSE_TOPIC, payload)`.
 */
export const realtime = new Elysia({ name: 'sipher-realtime' }).ws('/ws', {
	body: t.Object({
		type: t.Union([t.Literal('join-firehose'), t.Literal('leave-firehose')]),
	}),
	message(ws, message) {
		if (message.type === 'join-firehose') ws.subscribe(FIREHOSE_TOPIC)
		else ws.unsubscribe(FIREHOSE_TOPIC)
	},
})
