import { binary_to_base58 } from "base58-js";
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";
import nacl from "tweetnacl";

export interface EncryptedEnvelope {
	ephemeralPublicKey: string;
	iv: string;
	ciphertext: string;
	authTag: string;
}

function toBase64(buf: Uint8Array): string {
	return Buffer.from(buf).toString("base64");
}

function fromBase64(str: string): Uint8Array {
	return new Uint8Array(Buffer.from(str, "base64"));
}

function deriveAesKey(sharedSecret: Uint8Array): Buffer {
	return Buffer.from(
		hkdfSync("sha256", sharedSecret, Buffer.from("sipher-federation-v1-salt"), "sipher-federation-v1-aes", 32)
	);
}

export function signMessage(message: string, ed25519SecretKey: Uint8Array): string {
	const msgBytes = new TextEncoder().encode(message);
	const sig = nacl.sign.detached(msgBytes, ed25519SecretKey);
	return toBase64(sig);
}

export function verifySignature(message: string, signature: string, ed25519PublicKey: Uint8Array): boolean {
	try {
		const msgBytes = new TextEncoder().encode(message);
		const sigBytes = fromBase64(signature);
		return nacl.sign.detached.verify(msgBytes, sigBytes, ed25519PublicKey);
	} catch {
		return false;
	}
}

export function encryptPayload(plaintext: string, recipientX25519PublicKey: Uint8Array): EncryptedEnvelope {
	try {
		const ephemeral = nacl.box.keyPair();
		const sharedPoint = nacl.box.before(recipientX25519PublicKey, ephemeral.secretKey);
		const aesKey = deriveAesKey(sharedPoint);
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
		const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
		const authTag = cipher.getAuthTag();

		return {
			ephemeralPublicKey: toBase64(ephemeral.publicKey),
			iv: toBase64(iv),
			ciphertext: toBase64(encrypted),
			authTag: toBase64(authTag),
		};
	} catch (error) {
		throw error;
	}
}

export function decryptPayload(envelope: EncryptedEnvelope, ownX25519SecretKey: Uint8Array): string {
	try {
		const ephemeralPub = fromBase64(envelope.ephemeralPublicKey);
		const sharedPoint = nacl.box.before(ephemeralPub, ownX25519SecretKey);
		const aesKey = deriveAesKey(sharedPoint);
		const iv = fromBase64(envelope.iv);
		const ciphertext = fromBase64(envelope.ciphertext);
		const authTag = fromBase64(envelope.authTag);

		const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
		decipher.setAuthTag(authTag);
		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
		return decrypted.toString("utf8");
	} catch (error) {
		console.error("If you're trying to rotate keys, then your old keys are invalid and doesn't match the keys that the other federation has. You'll have to contact that federation in order to rotate your keys.")
		console.error("If you're not trying to rotate keys, then you're either doing something wrong or the other federation shouldn't be trusted anymore. Most likely the first.")
		throw error;
	}
}

export function fingerprintKey(keyBase64: string): string {
	const hash = createHash("sha256").update(fromBase64(keyBase64)).digest("hex");
	return hash;
}

export function generateUserKeyPair(): { fingerprint: string, signingPublicKey: string, signingSecretKey: string } {
	const signing = nacl.sign.keyPair();

	// hash the public key to get the fingerprint
	const fingerprintBytes = createHash("sha256").update(toBase64(signing.publicKey)).digest();
	// encode the fingerprint bytes as base58
	const fingerprintString = binary_to_base58(fingerprintBytes);
	// return the fingerprint string and the signing public key
	return {
		fingerprint: fingerprintString,
		signingPublicKey: toBase64(signing.publicKey),
		signingSecretKey: toBase64(signing.secretKey),
	};
}

/**
 * Generates a key blob for the user keys. 
 * The data encrypted is not readable to the federation or any other person that has access to the database.
 * @param password - The user's password.
 * @param keys - The user's keys.
 * @returns The key blob.
 */
// export async function generateUserKeyBlob(password: string, keys: { signingPublicKey: string, signingSecretKey: string, encryptionPublicKey: string, encryptionSecretKey: string }): Promise<string> {
// 	const olm = new Olm();
// }

export function getOwnEncryptionPublicKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!, "base64"))
}

export function getOwnSigningPublicKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_PUBLIC_KEY!, "base64"))
}

export function getOwnSigningSecretKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_PRIVATE_KEY!, "base64"))
}

export function getOwnEncryptionSecretKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PRIVATE_KEY!, "base64"))
}