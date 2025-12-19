import type { Socket, Server as SocketIOServer } from "socket.io";
import { getDmRoomId } from "./dm";

interface JoinDmData {
	withUser: string; // The other user's ID
}

const dmJoinEvent: SiPher.EventsType = {
	name: "dm:join",
	description: "Join a DM room with another user",
	category: "user",
	type: "connection",
	handler: (socket: Socket, _io: SocketIOServer, data: JoinDmData) => {
		const user = (socket as any).user;
		if (!user?.id) {
			socket.emit("error", { message: "Not authenticated" });
			return;
		}

		const { withUser } = data;
		if (!withUser) {
			socket.emit("error", { message: "Missing 'withUser'" });
			return;
		}

		const roomId = getDmRoomId(user.id, withUser);
		socket.join(roomId);

		socket.emit("dm:joined", { roomId, withUser });
		console.log(`[DM] ${user.id} joined room ${roomId}`);
	},
};

export default dmJoinEvent;

