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
	name: "dm:send",
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

		// Message parser:
		// 08/01/2026: I bwoke it :3 - Cete
		const message: {
			type: 0 | 1;
			body: string;
		} = typeof content === "string" ? JSON.parse(content) : content;

		// Send to the DM room (for users already in the room)
		io.to(roomId).emit("dm:message", message);

		// Also send directly to recipient's socket (socket.id = user.id)
		// This ensures they receive the message even if not in the DM room yet
		const dmData = {
			content: message,
			participants: [sender.id, to].sort(),
		};

		// Before sending, check if the participant ids are not the same (This is happening) 
		if (sender.id === to) {
			socket.emit("error", { message: "Cannot send DM to yourself" });
			console.error("[DM] Cannot send DM to yourself: ", sender.id, "→", to);
			return;
		}

		io.to(to).emit("dm:new", dmData);

		console.log(`[DM] ${sender.id} → ${to} in room ${roomId}: ${message.body}`);
	},
};

export default dmEvent;

