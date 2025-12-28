/**
 * @fileoverview Ping event handler for measuring latency and checking connection health
 */

import type { Socket, Server as SocketIOServer } from "socket.io";

export default {
	name: "ping",
	description: "Handles client ping requests and returns pong with timestamp for latency measurement",
	category: "system",
	type: "custom",
	handler: (socket: Socket, io: SocketIOServer, callback?: (serverTimestamp: number) => void) => {
		const serverTimestamp = Date.now();

		// Use acknowledgment callback if provided (more reliable than emit)
		if (callback && typeof callback === "function") {
			callback(serverTimestamp);
		} else {
			// Fallback to emit if no callback
			socket.emit("pong", serverTimestamp);
		}
	}
} satisfies SiPher.EventsType;

