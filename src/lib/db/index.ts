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
	recipientKeyVersion?: number; // Track recipient's key version
	recipientIdentityKey?: { curve25519: string; ed25519: string }; // Track recipient's identity key
}

/** Unread count per channel */
export interface UnreadCount {
	channelId: string;
	count: number;
}

/** Encryption key storage (for password protection in session storage) */
export interface EncryptionKey {
	id: string;
	key: CryptoKey;
	createdAt: number;
}

// ============================================
// Database
// ============================================

class SipherDB extends Dexie {
	olmAccounts!: EntityTable<OlmAccount, "odId">;
	olmSessions!: EntityTable<OlmSession, "odId">;
	channels!: EntityTable<SiPher.Channel, "id">;
	messages!: EntityTable<SiPher.Messages.ClientEncrypted.EncryptedMessage, "id">;
	unreadCounts!: EntityTable<UnreadCount, "channelId">;
	encryptionKeys!: EntityTable<EncryptionKey, "id">;

	constructor() {
		super("SipherDB");

		this.version(1).stores({
			olmAccounts: "odId, createdAt",
			olmSessions: "[odId+recipientId], odId, recipientId, createdAt",
			channels: "id, *participants, type, lastMessageAt, createdAt",
			messages: "id, channelId, fromUserId, timestamp, status",
			unreadCounts: "channelId",
			encryptionKeys: "id, createdAt",
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
	otherUser: {
		id: string
		name: string
	}
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
): Promise<SiPher.Messages.ClientEncrypted.EncryptedMessage[]> {
	let query = db.messages.where("channelId").equals(channelId);

	if (before) {
		query = query.and((m) => m.timestamp < before);
	}

	return query.reverse().sortBy("timestamp").then((msgs) => msgs.slice(0, limit));
}

/** Validate session keys match recipient's current keys */
export async function validateSessionKeys(
	recipientId: string,
	currentKeyVersion: number,
	currentIdentityKey: { curve25519: string; ed25519: string }
): Promise<boolean> {
	console.debug(`[DB] Validating session keys for ${recipientId}`, {
		currentKeyVersion,
		currentIdentityKey
	});

	const sessions = await db.olmSessions
		.where("recipientId")
		.equals(recipientId)
		.toArray();

	console.debug(`[DB] Found ${sessions.length} existing sessions for ${recipientId}`);

	if (sessions.length === 0) {
		console.debug(`[DB] No existing session - validation passes`);
		return true; // No session yet, validation passes
	}

	const session = sessions[0];
	console.debug(`[DB] Existing session metadata:`, {
		recipientKeyVersion: session.recipientKeyVersion,
		recipientIdentityKey: session.recipientIdentityKey
	});

	// Check if key version has changed
	if (session.recipientKeyVersion !== undefined && session.recipientKeyVersion !== currentKeyVersion) {
		console.warn(`[DB] Key version mismatch for ${recipientId}: local=${session.recipientKeyVersion}, server=${currentKeyVersion}`);
		return false;
	}

	// Check if identity key has changed
	if (session.recipientIdentityKey) {
		if (session.recipientIdentityKey.curve25519 !== currentIdentityKey.curve25519 ||
			session.recipientIdentityKey.ed25519 !== currentIdentityKey.ed25519) {
			console.warn(`[DB] Identity key mismatch for ${recipientId}`);
			console.warn(`[DB] Local curve25519: ${session.recipientIdentityKey.curve25519}`);
			console.warn(`[DB] Server curve25519: ${currentIdentityKey.curve25519}`);
			console.warn(`[DB] Local ed25519: ${session.recipientIdentityKey.ed25519}`);
			console.warn(`[DB] Server ed25519: ${currentIdentityKey.ed25519}`);
			return false;
		}
	}

	console.debug(`[DB] Key validation passed for ${recipientId}`);
	return true;
}

/** Invalidate and remove session for a recipient */
export async function invalidateSession(userId: string, recipientId: string): Promise<void> {
	await db.olmSessions
		.where("[odId+recipientId]")
		.equals([userId, recipientId])
		.delete();
	console.log(`[DB] Invalidated session for ${recipientId}`);
}

/** Add a message to local storage */
export async function sendMessage(
	message: Omit<SiPher.Messages.ClientEncrypted.EncryptedMessage, "id"> & { to: string },
	olmSession: Olm.Session,
	sendMessage: (message: { type: 0 | 1; body: string }, to: string) => void,
	saveSession?: {
		userId: string;
		recipientId: string;
		password: string;
		recipientKeyVersion?: number;
		recipientIdentityKey?: { curve25519: string; ed25519: string };
	}
): Promise<string> {
	console.log("[DB] sendMessage called", {
		channelId: message.channelId,
		to: message.to,
		hasSession: !!olmSession,
		hasSaveSession: !!saveSession
	});

	const id = crypto.randomUUID();
	console.log("[DB] Generated message ID:", id);

	await db.messages.add({ ...message, id });
	console.log("[DB] Message added to local DB");

	// Update channel's lastMessageAt
	await db.channels.where("id").equals(message.channelId).modify((channel) => {
		channel.times.lastMessage = message;
		channel.times.lastMessageAt = message.timestamp;
		channel.times.updatedAt = Date.now();
	});
	console.log("[DB] Channel updated with last message");

	// Encrypt the message
	console.log("[DB] Encrypting message...");
	const encrypted = olmSession.encrypt(
		JSON.stringify({
			id,
			channelId: message.channelId,
			fromUserId: message.fromUserId,
			timestamp: message.timestamp,
			status: message.status,
			content: message.content,
		} satisfies SiPher.Messages.ClientEncrypted.EncryptedMessage)
	);
	console.log("[DB] Message encrypted, type:", encrypted.type);

	// CRITICAL: Save the updated session after encrypt (ratchet has advanced)
	if (saveSession) {
		console.log("[DB] Saving session state...", {
			recipientKeyVersion: saveSession.recipientKeyVersion,
			hasIdentityKey: !!saveSession.recipientIdentityKey
		});

		const updateData: Partial<OlmSession> = {
			pickledSession: olmSession.pickle(saveSession.password),
			updatedAt: Date.now(),
		};

		// Update key version and identity key if provided
		if (saveSession.recipientKeyVersion !== undefined) {
			updateData.recipientKeyVersion = saveSession.recipientKeyVersion;
		}
		if (saveSession.recipientIdentityKey) {
			updateData.recipientIdentityKey = saveSession.recipientIdentityKey;
		}

		await db.olmSessions
			.where("[odId+recipientId]")
			.equals([saveSession.userId, saveSession.recipientId])
			.modify(updateData);
		console.log("[DB] Session state saved after encrypt with keyVersion:", saveSession.recipientKeyVersion);
	}

	// Send the message using the socket
	console.log("[DB] Sending message via socket to:", message.to);
	sendMessage(encrypted, message.to);
	console.log("[DB] Message sent via socket");

	return id;
}

export async function storeMessage(
	message: SiPher.Messages.ClientEncrypted.EncryptedMessage & { to: string },
	options?: {
		skipUnreadIncrement?: boolean; // Skip incrementing if user is viewing the channel
	}
): Promise<void> {
	await db.messages.add(message);
	await db.channels.where("id").equals(message.channelId).modify((channel) => {
		channel.times.lastMessage = message;
		channel.times.lastMessageAt = message.timestamp;
		channel.times.updatedAt = Date.now();
	});

	// Only increment unread if not explicitly skipped
	if (!options?.skipUnreadIncrement) {
		await incrementUnread(message.channelId);
	}
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
	await db.unreadCounts.delete(channelId);
	console.log(`[DB] Cleared unread count for channel ${channelId}`);
}

/** Get total unread count across all channels */
export async function getTotalUnread(): Promise<number> {
	const all = await db.unreadCounts.toArray();
	return all.reduce((sum, item) => sum + item.count, 0);
}
