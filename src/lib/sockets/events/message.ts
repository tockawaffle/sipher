import { Socket, Server as SocketIOServer } from "socket.io";

export default {
	name: "message",
	handler: (socket: Socket, io: SocketIOServer, ...args: any[]) => {
		console.log("Message received", args)
	},
	description: "A message event",
	category: "user",
	type: "message"
} satisfies SiPher.EventsType