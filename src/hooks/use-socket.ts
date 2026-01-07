/**
 * @deprecated This hook has been replaced with a context-based approach.
 * 
 * Please use the SocketProvider and useSocketContext instead:
 * 
 * @example
 * ```tsx
 * import { SocketProvider, useSocketContext } from '@/contexts/socket-context';
 * 
 * // In your component:
 * const { sendMessage, socketStatus, socketInfo, disconnect, connect } = useSocketContext();
 * ```
 * 
 * This file will be removed in a future version.
 */

"use client"

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api } from "../../convex/_generated/api";

interface UseSocketProps {
	user: {
		id?: string;
		status: {
			status: "online" | "busy" | "offline" | "away";
			isUserSet: boolean;
		}
	}
	refetchUser: () => void;
}

/** @deprecated Use useSocketContext from '@/contexts/socket-context' instead */
export function useSocket({ user, refetchUser }: UseSocketProps) {
	const updateUserStatus = useMutation(api.auth.updateUserStatus);
	const socketRef = useRef<Socket | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

	const [socketStatus, setSocketStatus] = useState<SiPher.SocketStatus>("connecting");
	const [socketInfo, setSocketInfo] = useState<SiPher.SocketInfo>({
		ping: null,
		transport: null,
		connectedAt: null,
		socketId: null,
		serverUrl: null,
		error: null
	});

	// Manual disconnect function
	const disconnect = useCallback(() => {
		if (socketRef.current) {
			console.log("🔌 Manually disconnecting socket...");
			socketRef.current.disconnect();
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
			setSocketStatus("manually_disconnected");
		}
	}, []);

	const connect = useCallback(() => {
		if (socketRef.current) {
			socketRef.current.connect();
			refetchUser();
		}
	}, [refetchUser]);

	const sendMessage = useCallback((message: { type: 0 | 1; body: string }, to: string) => {
		if (!socketRef.current) return;

		socketRef.current.emit("dm:send", {
			to,
			content: JSON.stringify(message),
		});
	}, [socketRef]);

	useEffect(() => {
		if (!user.id) return;

		const socket: Socket = io({
			withCredentials: true, reconnectionAttempts: 3, reconnectionDelay: 1000, reconnectionDelayMax: 5000
		});
		socketRef.current = socket;

		// Measure ping latency using acknowledgment callback
		const measurePing = () => {
			const clientTimestamp = Date.now();

			// Use acknowledgment callback for reliable latency measurement
			socket.timeout(5000).emit("ping", (err: Error, serverTimestamp: number) => {
				if (err) {
					console.warn("[Socket] Ping timeout or error:", err);
					setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, ping: null }));
					return;
				}

				const now = Date.now();
				const latency = now - clientTimestamp;
				console.log("[Socket] Ping latency:", latency);
				setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, ping: latency }));
			});
		};

		function setUserDefaultStatus(
			newStatus: "online" | "busy" | "offline" | "away",
			oldStatus?: {
				status: "online" | "busy" | "offline" | "away";
				isUserSet: boolean;
			}
		) {
			if (!oldStatus) {
				console.log("🔌 User default status set to online");
				updateUserStatus({ status: "online", isUserSet: false });
				refetchUser();
				return;
			}

			if (newStatus === "offline") {
				updateUserStatus({ status: newStatus, isUserSet: oldStatus.isUserSet });
				refetchUser();
				return;
			} else if (!oldStatus.isUserSet) {
				console.log("🔌 User default status set to online");
				updateUserStatus({ status: newStatus, isUserSet: oldStatus.isUserSet });
				refetchUser();
				return;
			} else {
				updateUserStatus({ status: oldStatus.status, isUserSet: oldStatus.isUserSet });
				refetchUser();
				return;
			}
		}

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

			setUserDefaultStatus("online", user.status);

			// Start ping measurement every 5 seconds for latency display
			measurePing();
			pingIntervalRef.current = setInterval(measurePing, 5000);
		});

		// Update transport when it upgrades (polling -> websocket)
		socket.io.engine?.on("upgrade", (transport) => {
			setSocketInfo((prev: SiPher.SocketInfo) => ({ ...prev, transport: transport.name }));
		});

		socket.on("connect_error", (err) => {
			console.error("❌ Socket connection error:", err.message);
			setUserDefaultStatus("offline", user.status);
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
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
		});

		socket.on("reconnect_attempt", (attempt) => {
			console.log("🔌 Reconnect attempt:", attempt);
			setSocketStatus("connecting");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				ping: null,
				connectedAt: null,
				error: null
			}));
		});

		socket.on("reconnect_error", (error) => {
			console.error("❌ Reconnect error:", error);
			setSocketStatus("error");
			setSocketInfo((prev: SiPher.SocketInfo) => ({
				...prev,
				ping: null,
				connectedAt: null,
				error: error.message
			}));
		});

		return () => {
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
			socket.disconnect();
		};
	}, [user.id, updateUserStatus]);

	return { socketStatus, socketInfo, disconnect, connect, sendMessage };
}

