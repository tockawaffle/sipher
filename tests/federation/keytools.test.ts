import type { EncryptedEnvelope } from "@/lib/federation/keytools";
import {
	decryptPayload,
	encryptPayload,
	fingerprintKey,
	signMessage,
	verifySignature,
} from "@/lib/federation/keytools";
import { expect, test } from "bun:test";
import nacl from "tweetnacl";

test("encryptPayload round-trips through decryptPayload for matching recipient keys", () => {
	const recipient = nacl.box.keyPair();
	const pub = new Uint8Array(recipient.publicKey);
	const secret = new Uint8Array(recipient.secretKey);
	const plaintext = JSON.stringify({ probe: true, n: 42 });
	const env = encryptPayload(plaintext, pub);
	expect(decryptPayload(env, secret)).toBe(plaintext);
});

test("decryptPayload rejects tampered authTag", () => {
	const recipient = nacl.box.keyPair();
	const plaintext = "tamper-me";
	const env = encryptPayload(plaintext, new Uint8Array(recipient.publicKey));
	const tag = Buffer.from(env.authTag, "base64");
	tag[0] ^= 0xff;
	env.authTag = tag.toString("base64");
	expect(() =>
		decryptPayload(env, new Uint8Array(recipient.secretKey)),
	).toThrow();
});

test("decryptPayload rejects wrong recipient secret key", () => {
	const a = nacl.box.keyPair();
	const b = nacl.box.keyPair();
	const env = encryptPayload("secret", new Uint8Array(a.publicKey));
	expect(() => decryptPayload(env, new Uint8Array(b.secretKey))).toThrow();
});

test("signMessage / verifySignature: happy path and tamper rejection", () => {
	const signing = nacl.sign.keyPair();
	const msg = 'canonical-message-bytes';
	const sig = signMessage(msg, new Uint8Array(signing.secretKey));
	expect(
		verifySignature(msg, sig, new Uint8Array(signing.publicKey)),
	).toBe(true);

	expect(
		verifySignature(msg + "x", sig, new Uint8Array(signing.publicKey)),
	).toBe(false);

	const other = nacl.sign.keyPair();
	expect(
		verifySignature(msg, sig, new Uint8Array(other.publicKey)),
	).toBe(false);
});

test("fingerprintKey is hex-stable across repeated calls", () => {
	const b64 = Buffer.alloc(nacl.box.publicKeyLength, 9).toString("base64");
	expect(fingerprintKey(b64)).toMatch(/^[0-9a-f]{64}$/);
	expect(fingerprintKey(b64)).toBe(fingerprintKey(b64));
});

test("encryptPayload ciphertext mutation breaks decryption", () => {
	const recipient = nacl.box.keyPair();
	const env: EncryptedEnvelope = encryptPayload("payload", new Uint8Array(recipient.publicKey));
	const ct = Buffer.from(env.ciphertext, "base64");
	if (ct.length > 0) ct[0] ^= 1;
	env.ciphertext = ct.toString("base64");
	expect(() =>
		decryptPayload(env, new Uint8Array(recipient.secretKey)),
	).toThrow();
});
