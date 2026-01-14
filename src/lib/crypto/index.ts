import { db } from "@/lib/db";

const PASSWORD_ENCRYPTION_KEY_ID = "password_encryption_key";

/**
 * Get or create the password encryption key.
 * The key is non-extractable, meaning its raw bytes cannot be read,
 * even if an attacker accesses IndexedDB directly.
 */
export async function getOrCreatePasswordEncryptionKey(): Promise<CryptoKey> {
	// Try to load existing key from DB
	const existing = await db.encryptionKeys.get(PASSWORD_ENCRYPTION_KEY_ID);
	if (existing) {
		console.debug("[PEC - getOrCreatePasswordEncryptionKey]: Loaded existing encryption key from DB");
		return existing.key;
	}

	// Generate new AES-GCM key (non-extractable)
	const newKey = await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		false, // NOT extractable - raw key bytes cannot be exported
		["encrypt", "decrypt"]
	);

	// Store in DB
	await db.encryptionKeys.add({
		id: PASSWORD_ENCRYPTION_KEY_ID,
		key: newKey,
		createdAt: Date.now(),
	});

	console.debug("[PEC - getOrCreatePasswordEncryptionKey]: Generated and stored new encryption key");
	return newKey;
}

/**
 * Encrypt a password string using AES-GCM.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export async function encryptPassword(password: string, key: CryptoKey): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password);

	// Generate random IV for each encryption
	const iv = crypto.getRandomValues(new Uint8Array(12));

	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		data
	);

	// Combine IV + ciphertext
	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(encrypted), iv.length);

	// Encode as base64
	return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a password string using AES-GCM.
 * Returns null if decryption fails (e.g., wrong key or corrupted data).
 */
export async function decryptPassword(encryptedData: string, key: CryptoKey): Promise<string | null> {
	try {
		// Decode from base64
		const combined = new Uint8Array(
			atob(encryptedData).split("").map(c => c.charCodeAt(0))
		);

		// Extract IV (first 12 bytes) and ciphertext
		const iv = combined.slice(0, 12);
		const data = combined.slice(12);

		const decrypted = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			data
		);

		return new TextDecoder().decode(decrypted);
	} catch (err) {
		console.warn("[PEC - decryptPassword]: Password decryption failed:", err);
		return null;
	}
}
