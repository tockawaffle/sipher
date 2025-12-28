import { Socket, Server as SocketIOServer } from "socket.io";

export default {
	name: "message",
	handler: (socket: Socket, io: SocketIOServer, ...args: any[]) => {
		console.log("Message received", args)
	},
	description: "Send a message to a channel by using the server-side encryption",
	category: "server",
	type: "message"
} satisfies SiPher.EventsType