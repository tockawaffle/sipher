import { getDb, type IdentityRecord } from "@/lib/dexie";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import nacl from "tweetnacl";

/**
 * Plaintext shape inside the AES-GCM-sealed identity blob in Dexie.
 * The mnemonic + secret key combined make this the only thing in the system
 * capable of producing valid signatures for the user's identity.
 */
interface IdentityPlaintext {
	mnemonic: string;
	fingerprint: string;
	publicKey: number[];
	secretKey: number[];
}

/**
 * Decrypt the user's local identity blob using their master password.
 *
 * The PBKDF2 cost (600k iters) makes a brute-force attack against a stolen
 * Dexie copy expensive; the GCM tag detects tampering. Used by both the
 * `useSigningKey` callback API in the Oven plugin and the one-shot
 * `signWithLocalIdentity` helper below.
 */
export async function decryptIdentity(
	record: IdentityRecord,
	password: string,
): Promise<IdentityPlaintext> {
	const aesKey = await pbkdf2Async(sha256, password, Uint8Array.from(record.salt), {
		c: 600_000,
		dkLen: 32,
	});
	const plaintext = gcm(aesKey, Uint8Array.from(record.iv)).decrypt(Uint8Array.from(record.ciphertext));
	return JSON.parse(new TextDecoder().decode(plaintext)) as IdentityPlaintext;
}

/**
 * Sign one message with the user's Ed25519 identity secret key.
 *
 * Decrypts the keypair, produces a single detached signature, then zeroes the
 * secret bytes from memory before returning. Returns `null` if the user has
 * no identity stored locally on this device.
 */
export async function signWithLocalIdentity(
	userId: string,
	password: string,
	message: Uint8Array,
): Promise<{ signature: Uint8Array; publicKey: Uint8Array } | null> {
	const record = await getDb().identity.get(userId);
	if (!record) return null;

	const parsed = await decryptIdentity(record, password);
	const secretKey = new Uint8Array(parsed.secretKey);
	const publicKey = new Uint8Array(parsed.publicKey);

	try {
		const signature = nacl.sign.detached(message, secretKey);
		return { signature, publicKey };
	} finally {
		secretKey.fill(0);
	}
}
