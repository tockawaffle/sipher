import { Session, User } from "better-auth";
import { Socket, Server as SocketIOServer } from "socket.io";

declare global {
	namespace SiPher {
		type EventsType = {
			name: string,
			handler: (socket: Socket, io: SocketIOServer, ...args: any[]) => void
			description: string
			category: string
			// Event type of socket.io
			type: string
		};

		type SocketConnectionState = "connected" | "disconnected" | "connecting"

		enum ChannelType {
			DM = "DM",
			GROUP = "GROUP",
			REGIONAL = "REGIONAL",
			GLOBAL = "GLOBAL",
			SERVER = "SERVER",
			SYSTEM = "SYSTEM"
		}

		type Channel = {
			id: string,
			name: string,
			type: typeof ChannelType.DM | typeof ChannelType.GROUP | typeof ChannelType.REGIONAL | typeof ChannelType.GLOBAL | typeof ChannelType.SERVER | typeof ChannelType.SYSTEM
			participants: string[]
			times: {
				createdAt: number,
				updatedAt: number,
				lastMessageAt?: number,
				lastMessage?: Message,
			},
			isOpen: boolean,
			metadata?: {
				description?: string,
				subtitle?: string,
				icon?: string,
				banner?: string,
				cover?: string,
				colors?: {
					primary: string,
					accent: string,
				}
			}
		}

		type SipherUser = {
			id: string,
			username: string,
			displayUsername: string,
			profile: {
				avatar: string,
				banner: string,
				cover: string,
				colors: {
					primary: string,
					accent: string,
				}
			}
			metadata: {
				description?: string,
				pronouns?: string,
			}
		}

		type Group = {
			id: string,
		}

		type Regional = {
			id: string,
		}

		type Global = {
			id: string,
		}

		type Server = {
			id: string,
		}

		type System = {
			id: string,
		}

		type MessageRecipient = {
			type: typeof ChannelType.DM,
			socketId: Socket["id"]
			id: string,
			user: SipherUser
		} | {
			type: typeof ChannelType.GROUP,
			id: string,
			group: Group
		} | {
			type: typeof ChannelType.REGIONAL,
			id: string,
			region: Regional
		} | {
			type: typeof ChannelType.GLOBAL,
			id: string,
			global: Global
		} | {
			type: typeof ChannelType.SERVER,
			id: string,
			server: Server
		} | {
			type: typeof ChannelType.SYSTEM,
			id: string,
			system: System
		}
	}

	// Add custom socket.io types
}

// Extend Socket.io types to include authenticated user data
declare module "socket.io" {
	interface Socket {
		/** Authenticated user from Better Auth (set after auth middleware) */
		user?: User;
		/** Session data from Better Auth (set after auth middleware) */
		session?: Session;
	}
}

export { };

