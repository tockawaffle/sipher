import Dexie, { type EntityTable } from "dexie";

/**
 * Encrypted local identity, AES-GCM sealed with a PBKDF2-derived key from the
 * user's master password.
 *
 * The plaintext is JSON of the form:
 *   {
 *     mnemonic: string,         // BIP-39 recovery phrase
 *     fingerprint: string,      // base58 of publicKey
 *     publicKey:  number[],     // 32-byte Ed25519 public key
 *     secretKey:  number[],     // 64-byte NaCl Ed25519 secret key
 *   }
 *
 * The secret key never leaves this record in plaintext: it is decrypted
 * transiently inside `useSigningKey` (see `client/index.ts`), used for a
 * single signing operation, then zeroed. The OlmMachine keeps its own
 * separate IndexedDB-backed state managed by the rust-sdk crypto wasm bundle.
 */
export interface IdentityRecord {
	/** Better Auth user ID — primary key. */
	userId: string;
	/** PBKDF2 salt (16 bytes, stored as number[]). */
	salt: number[];
	/** AES-GCM IV (12 bytes, stored as number[]). */
	iv: number[];
	/** AES-GCM ciphertext of the JSON payload described above. */
	ciphertext: number[];
}

/** A decrypted and cached Matrix room event. */
interface DecryptedEvent {
	/** Matrix event ID – globally unique, used as primary key. */
	eventId: string;
	roomId: string;
	senderUserId: string;
	eventType: string;
	/** JSON-serialised plaintext content. */
	contentJson: string;
	originServerTs: number;
}

/**
 * Metadata for a room the local user participates in.
 *
 * Persisting `memberUserIds` lets the app call `updateTrackedUsers` on every
 * startup without waiting for a full /sync, so the OlmMachine always has
 * up-to-date device lists before the first encryption attempt.
 */
interface RoomRecord {
	/** Matrix room ID – primary key. */
	roomId: string;
	displayName: string;
	/** User IDs of all E2EE members we need to track. */
	memberUserIds: string[];
	encryptionEnabled: boolean;
	lastEventTs: number;
}

/**
 * Sync cursor and per-room read position.
 *
 * Stored client-side because the homeserver does not track which events
 * the local user has already rendered.
 */
interface SyncState {
	/** Singleton row – always use key "current". */
	key: string;
	/** The `next_batch` token from the last successful /sync response. */
	nextBatch: string | null;
	/** roomId → last event ID the user has read. */
	readPositions: Record<string, string>;
}

class SipherDb extends Dexie {
	decryptedEvents!: EntityTable<DecryptedEvent, "eventId">;
	rooms!: EntityTable<RoomRecord, "roomId">;
	syncState!: EntityTable<SyncState, "key">;
	identity!: EntityTable<IdentityRecord, "userId">;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(idb?: any, idbRange?: any) {
		if (idb && idbRange) {
			super("MatrixClientDB", { indexedDB: idb, IDBKeyRange: idbRange });
		} else {
			super("MatrixClientDB");
		}

		this.version(1).stores({
			decryptedEvents: "eventId, roomId, senderUserId, originServerTs",
			rooms: "roomId, lastEventTs, encryptionEnabled",
			syncState: "key",
		});

		this.version(2).stores({
			identity: "userId",
		});
	}
}

let IndexedDB: SipherDb | null = null;

export function getDb(): SipherDb {
	if (IndexedDB) return IndexedDB;

	if (typeof (globalThis as any).indexedDB !== "undefined") {
		IndexedDB = new SipherDb((globalThis as any).indexedDB, (globalThis as any).IDBKeyRange);
	} else {
		IndexedDB = new SipherDb();
	}
	return IndexedDB;
}
