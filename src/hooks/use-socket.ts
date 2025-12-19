"use client"

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

export function useSocket(userId: string | undefined) {
	const [socketStatus, setSocketStatus] = useState<SiPher.SocketStatus>("connecting");
	const [socketInfo, setSocketInfo] = useState<SiPher.SocketInfo>({
		ping: null,
		transport: null,
		connectedAt: null,
		socketId: null,
		serverUrl: null,
		error: null
	});

	useEffect(() => {
		if (!userId) return;

		const socket: Socket = io({ withCredentials: false });
		let pingInterval: NodeJS.Timeout | null = null;

		// Measure ping latency
		const measurePing = () => {
			const start = Date.now();
			socket.volatile.emit("ping", () => {
				const latency = Date.now() - start;
				setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, ping: latency }));
			});
		};

		socket.on("connect", () => {
			console.log("✅ Connected to socket - Authentication successful!");
			setSocketStatus("connected");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				connectedAt: Date.now(),
				socketId: socket.id || null,
				serverUrl: window.location.origin,
				transport: socket.io.engine?.transport?.name || "unknown",
				error: null
			}));

			// Start ping measurement every 5 seconds
			measurePing();
			pingInterval = setInterval(measurePing, 5000);
		});

		// Update transport when it upgrades (polling -> websocket)
		socket.io.engine?.on("upgrade", (transport) => {
			setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, transport: transport.name }));
		});

		socket.on("connect_error", (err) => {
			console.error("❌ Socket connection error:", err.message);
			setSocketStatus("error");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				error: err.message,
				ping: null,
				connectedAt: null,
				socketId: null
			}));
		});

		socket.on("disconnect", (reason) => {
			console.log("🔌 Disconnected from socket:", reason);
			setSocketStatus("disconnected");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				ping: null,
				connectedAt: null,
				error: reason
			}));
			if (pingInterval) clearInterval(pingInterval);
		});

		// Handle pong response for ping measurement
		socket.on("pong", () => {
			// Handled in measurePing callback
		});

		return () => {
			if (pingInterval) clearInterval(pingInterval);
			socket.disconnect();
		};
	}, [userId]);

	return { socketStatus, socketInfo };
}

