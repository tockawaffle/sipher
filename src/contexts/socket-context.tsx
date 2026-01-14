"use client"

import { db, getOrCreateDmChannel, incrementUnread, storeMessage } from "@/lib/db";
import { convex } from "@/lib/providers/Convex";
import { useMutation } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import { useOlmContext } from "./olm-context";

interface SocketContextValue {
	socketStatus: SiPher.SocketStatus;
	socketInfo: SiPher.SocketInfo;
	sendMessage: (message: { type: 0 | 1; body: string }, to: string) => void;
	disconnect: () => void;
	connect: () => void;
	socket: Socket | null;
}

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
	children: React.ReactNode;
	user: {
		id?: string;
		status: {
			status: "online" | "busy" | "offline" | "away";
			isUserSet: boolean;
		}
	}
	refetchUser: () => void;
}

// Helper: Message validation schema
const MESSAGE_SCHEMA = z.object({
	id: z.string(),
	channelId: z.string(),
	fromUserId: z.string(),
	timestamp: z.number(),
	status: z.enum(["sent", "delivered", "read"]),
	content: z.any(),
	to: z.string().optional(),
});

export function SocketProvider({ children, user, refetchUser }: SocketProviderProps) {
	const updateUserStatus = useMutation(api.auth.updateUserStatus);
	const socketRef = useRef<Socket | null>(null);
	const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const userStatusRef = useRef(user.status);
	const { createInboundSession, sessions, olmAccount, isReady: olmIsReady, password } = useOlmContext();

	// Queue for messages received before OLM is ready
	const messageQueueRef = useRef<Array<{ content: { type: 0 | 1; body: unknown }, participants: string[] }>>([]);
	// Update the ref when status changes, but don't trigger effect
	useEffect(() => {
		userStatusRef.current = user.status;
	}, [user.status]);

	const [socketStatus, setSocketStatus] = useState<SiPher.SocketStatus>("connecting");
	const [socketInfo, setSocketInfo] = useState<SiPher.SocketInfo>({
		ping: null,
		transport: null,
		connectedAt: null,
		socketId: null,
		serverUrl: null,
		error: null
	});

	// Helper: Update socket info with partial values
	const updateSocketInfo = useCallback((updates: Partial<SiPher.SocketInfo>) => {
		setSocketInfo((prev) => ({ ...prev, ...updates }));
	}, []);

	// Helper: Save session state after decryption
	const saveSessionState = useCallback(async (
		session: any,
		currentUserId: string,
		fromUserId: string
	) => {
		if (!password) return;

		await db.olmSessions
			.where("[odId+recipientId]")
			.equals([currentUserId, fromUserId])
			.modify({
				pickledSession: session.pickle(password),
				updatedAt: Date.now(),
			});
		console.debug("[Socket]: Session state saved after decrypt");
	}, [password]);

	// Helper: Decrypt, validate, and store message
	const decryptAndStoreMessage = useCallback(async (
		session: any,
		messageType: 0 | 1,
		encryptedBody: string,
		currentUserId: string,
		fromUserId: string
	) => {
		// Decrypt the message
		const decryptedBody = session.decrypt(messageType, encryptedBody);
		const message = JSON.parse(decryptedBody);
		console.debug("[Socket]: Decrypted message:", message);

		// Save session state after decryption
		await saveSessionState(session, currentUserId, fromUserId);

		// Validate with ZOD
		const validatedMessage = MESSAGE_SCHEMA.safeParse(message);
		if (!validatedMessage.success) {
			console.error("[Socket]: Invalid message:", validatedMessage.error);
			throw new Error("Invalid message format");
		}

		// Store message and increment unread count
		await storeMessage(validatedMessage.data as SiPher.Messages.ClientEncrypted.EncryptedMessage & { to: string });
		await incrementUnread(validatedMessage.data.channelId);
		console.debug("[Socket]: Message stored successfully");
	}, [saveSessionState]);

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
		if (!socketRef.current) {
			console.warn("[Socket]: Cannot send message due to socket not being connected");
			return;
		}

		socketRef.current.emit("dm:send", {
			to,
			content: message,
		});
	}, []);

	// Define message processor that can be called from both socket handler and queue processor
	const processIncomingDM = useCallback(
		async (data: { content: { type: 0 | 1; body: unknown }, participants: string[] }) => {
			// Get the current user id
			console.debug("[Socket]: Processing incoming DM", data);
			const currentUserId = user.id;
			if (!currentUserId) {
				console.error("[Socket]: No user ID available");
				return;
			}

			// Extract sender from participants
			const fromUserId = data.participants.find((participant) => participant !== currentUserId);
			if (!fromUserId) {
				console.error("[Socket]: Could not determine sender from participants");
				return;
			}

			// Fetch participant details
			try {
				const participantDetails = await convex.query(api.auth.getParticipantDetails, {
					participantIds: [fromUserId]
				});

				const fromUser = participantDetails?.[0];
				if (!fromUser) {
					console.error("[Socket]: Failed to get from user");
					return;
				}

				const { type, body } = data.content;

				switch (type) {
					case 0: {
						console.debug("[Socket]: Received inbound message from pre-key message");

						const session = await createInboundSession(fromUserId, body as string);
						if (!session) {
							console.error("[Socket]: Failed to create inbound session");
							return;
						}

						// Now we can create or open the DM channel
						await getOrCreateDmChannel(currentUserId, fromUser);

						// Decrypt, validate, and store using helper
						await decryptAndStoreMessage(session, type, body as string, currentUserId, fromUserId);
						break;
					}
					case 1: {
						console.debug("[Socket]: Received regular message");

						// Get existing session from cache
						const session = sessions.get(fromUserId);
						if (!session) {
							console.error("[Socket]: No session found for sender. This shouldn't happen!");
							return;
						}

						// Decrypt, validate, and store using helper
						await decryptAndStoreMessage(session, type, body as string, currentUserId, fromUserId);
						break;
					}
				}
			} catch (error) {
				console.error("[Socket]: Error handling incoming DM:", error);
			}
		}, [user.id, createInboundSession, sessions, decryptAndStoreMessage]);

	// Process queued messages when OLM becomes ready
	useEffect(() => {
		if (!olmAccount || !olmIsReady || messageQueueRef.current.length === 0) return;

		console.log(`[Socket - processQueue]: OLM is now ready, processing ${messageQueueRef.current.length} queued messages`);

		const processQueue = async () => {
			const queue = [...messageQueueRef.current];
			messageQueueRef.current = []; // Clear queue

			for (const data of queue) {
				console.log("[Socket - processQueue]: Processing queued message:", data);
				await processIncomingDM(data);
			}
		};

		processQueue();
	}, [olmAccount, olmIsReady, processIncomingDM]);

	useEffect(() => {
		if (!user.id) return;

		const socket: Socket = io({
			withCredentials: true,
			reconnectionAttempts: 3,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000
		});
		socketRef.current = socket;

		// Measure ping latency using acknowledgment callback
		const measurePing = () => {
			const clientTimestamp = Date.now();

			// Use acknowledgment callback for reliable latency measurement
			socket.timeout(5000).emit("ping", (err: Error, serverTimestamp: number) => {
				if (err) {
					console.warn("[Socket]: Ping timeout or error:", err);
					updateSocketInfo({ ping: null });
					return;
				}

				const now = Date.now();
				const latency = now - clientTimestamp;
				updateSocketInfo({ ping: latency });
			});
		};

		// Helper: Update user status and refetch
		const updateAndRefetchUserStatus = (
			status: "online" | "busy" | "offline" | "away",
			isUserSet: boolean
		) => {
			updateUserStatus({ status, isUserSet });
			refetchUser();
		};

		function setUserDefaultStatus(
			newStatus: "online" | "busy" | "offline" | "away",
			oldStatus?: {
				status: "online" | "busy" | "offline" | "away";
				isUserSet: boolean;
			}
		) {
			if (!oldStatus) {
				console.log("[Socket - setUserDefaultStatus]: User default status set to online");
				updateAndRefetchUserStatus("online", false);
				return;
			}

			if (newStatus === "offline") {
				updateAndRefetchUserStatus(newStatus, oldStatus.isUserSet);
			} else if (!oldStatus.isUserSet) {
				console.log("[Socket - setUserDefaultStatus]: User default status set to online");
				updateAndRefetchUserStatus(newStatus, oldStatus.isUserSet);
			} else {
				updateAndRefetchUserStatus(oldStatus.status, oldStatus.isUserSet);
			}
		}

		socket.on("connect", () => {
			console.log("[Socket - connect]: Connected to socket - Authentication successful!");
			setSocketStatus("connected");
			updateSocketInfo({
				connectedAt: Date.now(),
				socketId: socket.id || null,
				serverUrl: window.location.origin,
				transport: socket.io.engine?.transport?.name || "unknown",
				error: null
			});

			setUserDefaultStatus("online", userStatusRef.current);

			// Start ping measurement every 5 seconds for latency display
			measurePing();
			pingIntervalRef.current = setInterval(measurePing, 5000);
		});

		// Update transport when it upgrades (polling -> websocket)
		socket.io.engine?.on("upgrade", (transport) => {
			updateSocketInfo({ transport: transport.name });
		});

		socket.on("connect_error", (err) => {
			console.error("[Socket - connect_error]: Socket connection error:", err.message);
			setUserDefaultStatus("offline", userStatusRef.current);
			setSocketStatus("error");
			updateSocketInfo({
				error: err.message,
				ping: null,
				connectedAt: null,
				socketId: null
			});
		});

		socket.on("disconnect", (reason) => {
			console.log("[Socket - disconnect]: Disconnected from socket:", reason);
			setSocketStatus("disconnected");
			updateSocketInfo({
				ping: null,
				connectedAt: null,
				error: reason
			});
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
		});

		socket.on("reconnect_attempt", (attempt) => {
			console.log("[Socket - reconnect_attempt]: Reconnect attempt:", attempt);
			setSocketStatus("connecting");
			updateSocketInfo({
				ping: null,
				connectedAt: null,
				error: null
			});
		});

		socket.on("reconnect_error", (error) => {
			console.error("[Socker - reconnect_error]:", error);
			setSocketStatus("error");
			updateSocketInfo({
				ping: null,
				connectedAt: null,
				error: error.message
			});
		});

		socket.on("dm:new", async (data: { content: { type: 0 | 1; body: unknown }, participants: string[] }) => {
			console.log("[Socket - dm:new]: New DM received:", data);

			// Check if OLM account is loaded
			if (!olmAccount) {
				console.warn("[Socket]: OLM account not loaded yet, queueing message for later processing");
				messageQueueRef.current.push(data);
				return;
			}

			// Process immediately if OLM is ready
			console.debug("[Socket]: Processing incoming DM immediately:", data);
			await processIncomingDM(data);
		});

		return () => {
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
			socket.disconnect();
		};
	}, [user.id, updateUserStatus, refetchUser, processIncomingDM, olmAccount, updateSocketInfo]);

	const contextValue: SocketContextValue = {
		socketStatus,
		socketInfo,
		sendMessage,
		disconnect,
		connect,
		socket: socketRef.current
	};

	return (
		<SocketContext.Provider value={contextValue}>
			{children}
		</SocketContext.Provider>
	);
}

export function useSocketContext() {
	const context = useContext(SocketContext);
	if (!context) {
		throw new Error('useSocketContext must be used within a SocketProvider');
	}
	return context;
}
