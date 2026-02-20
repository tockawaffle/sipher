/**
 * @fileoverview Socket Manager Class for handling socket connections and events at the server side.
 */

import { Session, User } from "better-auth";
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readdirSync } from "fs";
import type { Server as HTTPServer } from "http";
import path from "path";
import { Socket, Server as SocketIOServer } from "socket.io";
import { pathToFileURL } from "url";
import z from "zod";
import { api } from "../../../convex/_generated/api";

interface SocketManagerOptions {
	/** Enable authentication via Better Auth (default: false) */
	requireAuth?: boolean;
	/** Base URL for Better Auth API (default: http://localhost:3000) */
	authBaseUrl?: string;
	/** 
	 * Authentication method:
	 * - "session": Use existing session cookie (recommended for web clients)
	 * - "ott": Use one-time token (for non-browser clients or cross-origin)
	 */
	authMethod?: "session" | "ott";
}

const RECONCILE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export default class SocketManager {

	private socketIo: SocketIOServer | null = null;
	private events: Map<string, SiPher.EventsType[]> = new Map();
	private options: SocketManagerOptions;
	private convex: ConvexHttpClient;
	private reconcileTimer: ReturnType<typeof setInterval> | null = null;

	constructor(nextServer: HTTPServer, options: SocketManagerOptions = {}) {
		if (!nextServer) {
			throw new Error("Next server is required to create a SocketManager")
		}

		this.options = {
			requireAuth: false,
			authBaseUrl: process.env.SITE_URL || "http://localhost:3000",
			authMethod: "session",
			...options
		};

		// Initialize Convex client for server-side mutations
		if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
			throw new Error("NEXT_PUBLIC_CONVEX_URL is required for SocketManager");
		}
		this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

		if (!this.socketIo) {
			this.socketIo = new SocketIOServer(nextServer, {
				// Configure Socket.IO's built-in heartbeat mechanism
				pingInterval: 25000,  // Server sends ping every 25 seconds
				pingTimeout: 60000,   // Close connection if no pong received within 60 seconds
			});
		}

		if (this.options.requireAuth) {
			this.setupAuthMiddleware();
		}
	}

	private setupAuthMiddleware(): void {
		if (!this.socketIo) return;

		this.socketIo.use(async (socket, next) => {
			try {
				let result: { user?: User, session?: Session } | null = null;

				if (this.options.authMethod === "ott") {
					// OTT-based auth: client must provide token in auth object
					const token = socket.handshake.auth.token;
					if (!token) {
						return next(new Error("Authentication error: No token provided"));
					}

					const response = await fetch(`${this.options.authBaseUrl}/api/auth/one-time-token/verify`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ token })
					});

					if (!response.ok) {
						return next(new Error("Authentication error: Invalid token"));
					}

					result = await response.json();
				} else {
					// Session-based auth: use cookies from handshake
					const cookies = socket.handshake.headers.cookie || "";

					const response = await fetch(`${this.options.authBaseUrl}/api/auth/get-session`, {
						method: "GET",
						headers: { "Cookie": cookies }
					});

					if (!response.ok) {
						return next(new Error("Authentication error: No valid session"));
					}

					result = await response.json();
				}

				if (!result || !result.user) {
					return next(new Error("Authentication error: Invalid session"));
				}

				const { user, session } = result;

				// Set socket.id to user ID for persistent identification
				// @ts-expect-error: This should be a readonly property, but IDGAF, if it breaks, it breaks :D
				socket.id = user.id;

				// Attach user and session to socket for use in event handlers
				socket.user = user;
				socket.session = session;

				next();
			} catch (error) {
				console.error("[SocketManager] Auth error:", error);
				return next(new Error("Authentication error"));
			}
		});
	}

	public getSocketIo(): SocketIOServer {
		if (!this.socketIo) {
			throw new Error("SocketIO server is not initialized")
		}
		return this.socketIo
	}

	/** Emit to a specific user by their user ID */
	public emitToUser(userId: string, event: string, ...args: unknown[]): void {
		this.socketIo?.to(`user:${userId}`).emit(event, ...args);
	}

	/** Emit to a global/fixed room */
	public emitToRoom(roomId: string, event: string, ...args: unknown[]): void {
		this.socketIo?.to(roomId).emit(event, ...args);
	}

	/** Get a socket by user ID (socket.id = user.id after auth) */
	public getSocketByUserId(userId: string): Socket | undefined {
		return this.socketIo?.sockets.sockets.get(userId);
	}

	private extractJwt(socket: Socket): string | null {
		const cookies = socket.handshake.headers.cookie;
		if (!cookies || !cookies.includes("better-auth.convex_jwt")) return null;
		const token = cookies.split("better-auth.convex_jwt=")[1]?.split(";")[0];
		return token || null;
	}

	/**
	 * Periodically queries Convex for all users with a non-offline status,
	 * checks if they have a live socket connection, and forces offline
	 * any that don't.
	 */
	private startStatusReconciliation(): void {
		if (this.reconcileTimer) return;

		this.reconcileTimer = setInterval(async () => {
			try {
				const nonOfflineUsers = await this.convex.query(api.auth.getNonOfflineUserIds, {});
				if (!nonOfflineUsers || nonOfflineUsers.length === 0) return;

				const connectedSocketIds = this.socketIo?.sockets.sockets;
				let reconciled = 0;

				for (const entry of nonOfflineUsers) {
					const hasSocket = connectedSocketIds?.has(entry.userId) ?? false;
					if (hasSocket) continue;

					await this.convex.mutation(api.auth.forceUserOffline, { userId: entry.userId });
					reconciled++;
				}

				if (reconciled > 0) {
					console.log(`[SocketManager] Reconciled ${reconciled} ghost user(s) to offline`);
				}
			} catch (error) {
				console.error("[SocketManager] Status reconciliation error:", error);
			}
		}, RECONCILE_INTERVAL_MS);

		console.log(`[SocketManager] Status reconciliation started (every ${RECONCILE_INTERVAL_MS / 1000}s)`);
	}

	public async initializeEventHandler(): Promise<void> {
		// Get events from the events folder
		const socketIo = this.getSocketIo();
		const eventsFolderPath = path.join(process.cwd(), "src", "lib", "sockets", "events");
		console.log(`[SocketManager] Events folder path: ${eventsFolderPath}`)
		if (!existsSync(eventsFolderPath)) {
			console.warn(`[SocketManager] Events folder not found: ${eventsFolderPath}`)
			return
		}

		const eventFiles = readdirSync(eventsFolderPath)
			.filter((file: string) => file.endsWith(".ts") || file.endsWith(".js"))

		const eventValidator = z.object({
			name: z.string({ error: "Event 'name' must be a string" }),
			handler: z.function(), // Validates it's a function; args are flexible
			description: z.string({ error: "Event 'description' must be a string" }),
			category: z.enum(["user", "group", "regional", "global", "server", "system"], {
				error: "Event 'category' must be one of: user, group, regional, global, server, system",
			}),
			type: z.enum(["message", "connection", "disconnection", "error", "custom"], {
				error: "Event 'type' must be one of: message, connection, disconnection, error, custom",
			}),
		}, {
			error: "Event file must export a default object with: name, handler, description, category, type",
		});

		for (const file of eventFiles) {
			try {
				const filePath = path.join(eventsFolderPath, file)
				const fileURL = pathToFileURL(filePath).href
				const event = await import(fileURL).then(module => module.default)

				const validatedEvent = eventValidator.safeParse(event)
				if (!validatedEvent.success) {
					console.error(`[SocketManager] Invalid event file: ${file}`, validatedEvent.error.issues)
					console.error(`[SocketManager] Discarding event file: ${file}`)
					continue
				}

				const data = validatedEvent.data as SiPher.EventsType;

				// Group handlers by event name (what client emits)
				const handlers = this.events.get(data.name) || []
				handlers.push(data);
				this.events.set(data.name, handlers);

				console.log(`[SocketManager] Loaded event handler: ${data.name} (${data.category}/${data.type})`)
			} catch (error) {
				console.error(`[SocketManager] Failed to load event file: ${file}`, error)
			}
		}

		// Register all events with Socket.IO
		socketIo.on("connection", (socket) => {
			const user = socket.user;
			console.log(`[SocketManager] Client connected: ${socket.id}${user ? ` (${user.email})` : ""}`);

			// Register all event handlers by name
			for (const [eventName, handlers] of this.events) {
				for (const handler of handlers) {
					socket.on(eventName, (...args) => {
						try {
							handler.handler(socket, socketIo, ...args)
						} catch (error) {
							console.error(`[SocketManager] Error in ${handler.name}:`, error)
						}
					})
				}
			}

			// Handle disconnect within the connection context
			socket.on("disconnect", async (reason) => {
				try {
					const token = this.extractJwt(socket);
					if (!token) {
						console.warn(`[SocketManager] No session found for user ${socket.id}, skipping status update`);
						return;
					}

					this.convex.setAuth(token);
					await this.convex.mutation(api.auth.updateUserStatus, {
						status: "offline",
					});
					console.log(`[SocketManager] Set user ${socket.id} status to offline`);
				} catch (error) {
					console.error(`[SocketManager] Failed to set user status to offline:`, error);
				}
			});
		})

		this.startStatusReconciliation();
	}
}