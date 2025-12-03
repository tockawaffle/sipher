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

		enum MessageType {
			DM = "DM",
			GROUP = "GROUP",
			REGIONAL = "REGIONAL",
			GLOBAL = "GLOBAL",
			SERVER = "SERVER",
			SYSTEM = "SYSTEM"
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
			type: typeof MessageType.DM,
			socketId: Socket["id"]
			id: string,
			user: SipherUser
		} | {
			type: typeof MessageType.GROUP,
			id: string,
			group: Group
		} | {
			type: typeof MessageType.REGIONAL,
			id: string,
			region: Regional
		} | {
			type: typeof MessageType.GLOBAL,
			id: string,
			global: Global
		} | {
			type: typeof MessageType.SERVER,
			id: string,
			server: Server
		} | {
			type: typeof MessageType.SYSTEM,
			id: string,
			system: System
		}

		type MessageEvent = {
			message: {
				/** Will either be a raw string or a encrypted blob, if it is a encrypted blob, the iv will be provided */
				content: string,
				iv?: string
			},
			from: SipherUser,
			recipient: MessageRecipient
		}
	}
}

export { };

