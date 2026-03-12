import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
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

import { createHash } from "node:crypto";
export function fingerprintKey(keyBase64: string): string {
	const hash = createHash("sha256").update(fromBase64(keyBase64)).digest("hex");
	return hash;
}
