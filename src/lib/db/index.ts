import Dexie, { type EntityTable } from "dexie";
import { getDmRoomId } from "../sockets/events/dm";

// ============================================
// Types
// ============================================

/** User's Olm account (contains private keys) */
export interface OlmAccount {
	odId: string; // odId
	pickledAccount: string; // Serialized Olm.Account
	createdAt: number;
	updatedAt: number;
}

/** E2EE session with another user */
export interface OlmSession {
	odId: string; // Your user ID
	recipientId: string; // Other user's ID
	pickledSession: string; // Serialized Olm.Session
	createdAt: number;
	updatedAt: number;
}

/** Message stored locally */
export interface Message {
	id: string; // Unique message ID
	channelId: string; // Channel this belongs to
	fromUserId: string;
	content: string; // Decrypted content
	timestamp: number;
	status: "sent" | "delivered" | "read";
}

/** Unread count per channel */
export interface UnreadCount {
	channelId: string;
	count: number;
}

// ============================================
// Database
// ============================================

class SipherDB extends Dexie {
	olmAccounts!: EntityTable<OlmAccount, "odId">;
	olmSessions!: EntityTable<OlmSession, "odId">;
	channels!: EntityTable<SiPher.Channel, "id">;
	messages!: EntityTable<Message, "id">;
	unreadCounts!: EntityTable<UnreadCount, "channelId">;

	constructor() {
		super("SipherDB");

		this.version(1).stores({
			olmAccounts: "odId, createdAt",
			olmSessions: "[odId+recipientId], odId, recipientId, createdAt",
			channels: "id, *participants, type, lastMessageAt, createdAt",
			messages: "id, channelId, fromUserId, timestamp, status",
			unreadCounts: "channelId",
		});
	}
}

export const db = new SipherDB();

// ============================================
// Helper Functions
// ============================================

/** Get or create a DM channel with another user */
export async function getOrCreateDmChannel(
	myUserId: string,
	otherUser: any
): Promise<SiPher.Channel> {
	// Generate deterministic channel ID
	const channelId = getDmRoomId(myUserId, otherUser.id);

	const existing = await db.channels.get(channelId);
	if (existing) {
		// Change the isOpen status to true
		await db.channels.where("id").equals(channelId).modify((channel) => {
			channel.isOpen = true;
		});
		return existing;
	}

	const channel: SiPher.Channel = {
		id: channelId,
		name: otherUser.name,
		participants: [myUserId, otherUser.id].sort(),
		type: "DM" as typeof SiPher.ChannelType.DM,
		times: {
			createdAt: Date.now(),
			updatedAt: Date.now(),
			lastMessageAt: undefined,
			lastMessage: undefined,
		},
		metadata: undefined,
		isOpen: true,
	};

	await db.channels.add(channel);
	return channel;
}

/** Get messages for a channel */
export async function getChannelMessages(
	channelId: string,
	limit = 50,
	before?: number
): Promise<Message[]> {
	let query = db.messages.where("channelId").equals(channelId);

	if (before) {
		query = query.and((m) => m.timestamp < before);
	}

	return query.reverse().sortBy("timestamp").then((msgs) => msgs.slice(0, limit));
}

/** Add a message to local storage */
export async function addMessage(message: Omit<Message, "id">): Promise<string> {
	const id = crypto.randomUUID();
	await db.messages.add({ ...message, id });

	// Update channel's lastMessageAt
	await db.channels.where("id").equals(message.channelId).modify((channel) => {
		channel.times.lastMessage = message;
		channel.times.lastMessageAt = message.timestamp;
		channel.times.updatedAt = Date.now();
	});

	return id;
}

/** Increment unread count for a channel */
export async function incrementUnread(channelId: string): Promise<void> {
	const existing = await db.unreadCounts.get(channelId);
	if (existing) {
		await db.unreadCounts.update(channelId, { count: existing.count + 1 });
	} else {
		await db.unreadCounts.add({ channelId, count: 1 });
	}
}

/** Clear unread count for a channel */
export async function clearUnread(channelId: string): Promise<void> {
	await db.unreadCounts.put({ channelId, count: 0 });
}

/** Get total unread count across all channels */
export async function getTotalUnread(): Promise<number> {
	const all = await db.unreadCounts.toArray();
	return all.reduce((sum, item) => sum + item.count, 0);
}

/** Hash a string (for deterministic IDs) */
async function hashString(str: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
