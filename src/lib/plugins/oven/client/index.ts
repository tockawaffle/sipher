import { getDb } from "@/lib/dexie";
import { decryptIdentity } from "@/lib/identity/sign";
import type { KeysUploadRequest } from "@matrix-org/matrix-sdk-crypto-wasm";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { binary_to_base58 } from "base58-js";
import type { BetterAuthClientPlugin } from "better-auth/client";
import nacl from "tweetnacl";
import type { sipherOven } from "../server";

type SipherOvenPlugin = typeof sipherOven;

/**
 * Sipher Oven plugin — client side.
 *
 * Security model
 * --------------
 *   - The Ed25519 identity keypair is derived from a BIP-39 mnemonic via
 *     HKDF-SHA256 and stored AES-256-GCM encrypted in Dexie. The KEK is
 *     derived from the user's master password with PBKDF2 (600k iters).
 *   - The matching secret key is never returned from this plugin. The only
 *     way to use it is `useSigningKey`, which hands callers a `sign` closure
 *     and zeroes the in-memory secret immediately after the callback resolves.
 *   - Only the public Ed25519 key + base58 fingerprint are published to the
 *     server (federation). The matching secret never leaves this device.
 *   - The OlmMachine manages its own IndexedDB-backed state internally; we
 *     just forward the public OLM key bundle to the server via /oven/keys/upload.
 */
export const sipherOvenClientPlugin = () => {
	return {
		id: "sipher-oven",
		$InferServerPlugin: {} as ReturnType<SipherOvenPlugin>,
		getActions($fetch, _$store, _options) {
			return {
				createOvenIdentity: async (username: string, password: string) => {
					const { DeviceId, OlmMachine, RequestType, UserId, initAsync } = await import("@matrix-org/matrix-sdk-crypto-wasm");
					await initAsync();

					// On a fresh signup attempt (no Dexie identity yet), wipe any
					// stale OlmMachine IDB left over from a previous failed run —
					// otherwise OlmMachine.initialize throws "the account in the
					// store doesn't match the account in the constructor".
					if (!(await getDb().identity.get(username)) && typeof globalThis.indexedDB !== "undefined") {
						await new Promise<void>((resolve) => {
							const req = globalThis.indexedDB.deleteDatabase("matrix-sdk-crypto:sipher");
							req.onsuccess = req.onerror = req.onblocked = () => resolve();
						});
					}

					const mnemonic = bip39.generateMnemonic(wordlist, 128);
					const fullSeed = await bip39.mnemonicToSeed(mnemonic);
					const derived = hkdf(sha256, fullSeed, new Uint8Array(32), new TextEncoder().encode("sipher-identity-v1"), 32);
					const { publicKey, secretKey } = nacl.sign.keyPair.fromSeed(derived);
					const fingerprint = binary_to_base58(publicKey);

					const userId = new UserId(`@${username}:${fingerprint}`);
					const deviceId = new DeviceId(Buffer.from(randomBytes(32)).toString("base64"));
					const machine = await OlmMachine.initialize(userId, deviceId, "sipher", password);

					const salt = randomBytes(16);
					const iv = randomBytes(12);
					const aesKey = await pbkdf2Async(sha256, password, salt, { c: 600_000, dkLen: 32 });
					const plaintext = new TextEncoder().encode(JSON.stringify({
						mnemonic,
						fingerprint,
						publicKey: Array.from(publicKey),
						secretKey: Array.from(secretKey),
					}));
					const ciphertext = gcm(aesKey, iv).encrypt(plaintext);
					await getDb().identity.put({
						userId: username,
						salt: Array.from(salt),
						iv: Array.from(iv),
						ciphertext: Array.from(ciphertext),
					});

					secretKey.fill(0);

					const { error: registerError } = await $fetch<{ success: boolean }>("/oven/identity/register", {
						method: "POST",
						body: { signingPublicKey: binary_to_base58(publicKey), fingerprint },
					});
					if (registerError) {
						console.error("[createOvenIdentity]", registerError);
						throw new Error("Failed to register identity public key");
					}

					const requests = await machine.outgoingRequests();
					for (const request of requests) {
						switch (request.type) {
							case RequestType.KeysUpload: {
								const req = request as KeysUploadRequest;
								const { data, error } = await $fetch<{
									success: boolean;
									message?: string;
									one_time_key_counts: { signed_curve25519: number };
								}>("/oven/keys/upload", {
									method: "POST",
									body: req.body,
								});
								if (error) throw new Error("Failed to upload keys");
								if (!data?.success) throw new Error(data?.message ?? "Failed to upload keys.");
								// `markRequestAsSent` expects the SERVER RESPONSE body, not
								// the request body. Per the Matrix spec, the response must
								// include `one_time_key_counts` so the OlmMachine knows how
								// many OTKs the server is now holding.
								machine.markRequestAsSent(
									req.id,
									RequestType.KeysUpload,
									JSON.stringify({ one_time_key_counts: data.one_time_key_counts }),
								);
								break;
							}
						}
					}

					return { userId, deviceId, machine, fingerprint, publicKey, mnemonic };
				},

				/**
				 * Read-only accessor for non-secret identity material.
				 * Returns the mnemonic (so the user can view their recovery phrase),
				 * fingerprint, and public key. Never returns the secret key.
				 */
				loadLocalIdentity: async (userId: string, password: string) => {
					const record = await getDb().identity.get(userId);
					if (!record) return null;

					const parsed = await decryptIdentity(record, password);

					return {
						mnemonic: parsed.mnemonic,
						fingerprint: parsed.fingerprint,
						publicKey: new Uint8Array(parsed.publicKey),
					};
				},

				/**
				 * Briefly decrypt the signing keypair, hand the caller a `sign`
				 * closure for one or more signing operations, then wipe the
				 * secret bytes from memory. The secret never escapes this scope.
				 */
				useSigningKey: async <T>(
					userId: string,
					password: string,
					fn: (sign: (message: Uint8Array) => Uint8Array, publicKey: Uint8Array) => Promise<T> | T,
				): Promise<T | null> => {
					const record = await getDb().identity.get(userId);
					if (!record) return null;

					const parsed = await decryptIdentity(record, password);
					const secretKey = new Uint8Array(parsed.secretKey);
					const publicKey = new Uint8Array(parsed.publicKey);

					try {
						return await fn(
							(message) => nacl.sign.detached(message, secretKey),
							publicKey,
						);
					} finally {
						secretKey.fill(0);
					}
				},

				/**
				 * Reports whether the user has an identity locally (encrypted
				 * Dexie record) and/or remotely (registered with the server).
				 *
				 * Both halves matter:
				 *   - `local` is required to sign anything (the secret key lives
				 *     only in the encrypted Dexie blob).
				 *   - `server` is required for federation peers to verify those
				 *     signatures.
				 *
				 * Callers usually want `local && server` to consider the identity
				 * fully provisioned; `local && !server` means the server-side
				 * registration was lost and can be re-published; `!local && server`
				 * means the user needs a recovery flow on this device.
				 */
				checkIdentity: async (userId: string) => {
					const local = (await getDb().identity.get(userId)) !== undefined;
					const { data } = await $fetch<{ exists: boolean }>("/oven/identity/check", {
						method: "GET",
					});
					return { local, server: data?.exists ?? false };
				},
			};
		},
	} satisfies BetterAuthClientPlugin;
};
