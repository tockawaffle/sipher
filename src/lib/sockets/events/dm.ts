import { createHash } from "crypto";
import type { Socket, Server as SocketIOServer } from "socket.io";

/** 
 * Generate a deterministic DM room ID from two user IDs.
 * Uses SHA-256 hash for:
 * - Fixed length output (16 chars)
 * - No exposure of user IDs
 * - No delimiter collision issues
 */
export const getDmRoomId = (userA: string, userB: string): string => {
	const sorted = [userA, userB].sort().join(":");
	const hash = createHash("sha256").update(sorted).digest("hex").slice(0, 16);
	return `dm:${hash}`;
};

/** 
 * Alternative: If you need to know participants from room ID,
 * store a mapping in your database instead of encoding in the ID.
 */

interface DmMessage {
	to: string;      // Target user ID
	content: string; // Message content
}

const dmEvent: SiPher.EventsType = {
	name: "dm",
	description: "Send a direct message to another user using the client-side encryption",
	category: "user",
	type: "message",
	handler: (socket: Socket, io: SocketIOServer, data: DmMessage) => {
		const sender = (socket as any).user;
		if (!sender?.id) {
			socket.emit("error", { message: "Not authenticated" });
			return;
		}

		const { to, content } = data;
		if (!to || !content) {
			socket.emit("error", { message: "Missing 'to' or 'content'" });
			return;
		}

		// Compute deterministic room ID
		const roomId = getDmRoomId(sender.id, to);

		// Join sender to the DM room
		socket.join(roomId);

		const message = {
			roomId,
			from: {
				id: sender.id,
				name: sender.name,
				email: sender.email,
			},
			to,
			content, // <-- We can assume this was encrypted by the user
			timestamp: Date.now(),
		};

		// Send to the DM room (for users already in the room)
		io.to(roomId).emit("dm:message", message);

		// Also send directly to recipient's socket (socket.id = user.id)
		// This ensures they receive the message even if not in the DM room yet
		io.to(to).emit("dm:new", {
			...message,
			// Include sender info so recipient can identify the conversation
			participants: [sender.id, to],
		});

		console.log(`[DM] ${sender.id} → ${to} in room ${roomId}`);
	},
};

export default dmEvent;

