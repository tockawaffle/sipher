import db from "@/lib/db";
import { olmDeviceKeys, userIdentityKeys } from "@/lib/db/schema";
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	IdentityRegisterBodySchema,
	KeysUploadBodySchema,
	type SignedFallbackKey,
	type SignedKey,
} from "./schema";

/**
 * Sipher Oven plugin — server side.
 *
 * Security model
 * --------------
 * This plugin only ever touches PUBLIC cryptographic material:
 *
 *   - `userIdentityKeys` stores the user's stable Ed25519 verification key
 *     derived client-side from their BIP-39 mnemonic. The matching secret
 *     key is encrypted in the client's Dexie store and never reaches us.
 *   - `olmDeviceKeys` stores one row per device. The single `bundleJson`
 *     column holds the full Matrix `{ device_keys, one_time_keys, fallback_keys }`
 *     blob published by the OlmMachine. The OlmMachine keeps its own private
 *     state in IndexedDB.
 *
 * The schema in `./schema.ts` rejects anything that isn't a 32-byte
 * unpadded-base64 public key, which makes it structurally impossible for a
 * client to land a 64-byte NaCl secret key in any of the OLM key fields.
 */

interface DeviceBundle {
	device_keys: z.infer<typeof KeysUploadBodySchema>["device_keys"];
	one_time_keys: Record<string, SignedKey>;
	fallback_keys: Record<string, SignedFallbackKey>;
}

export const sipherOven = () => {
	return {
		id: "sipher-oven",
		schema: {
			/**
			 * Per-user stable identity keys.
			 * The Ed25519 signing key derived from the user's mnemonic seed.
			 * One row per user — must remain stable across all devices.
			 */
			userIdentityKeys: {
				fields: {
					userId: {
						type: "string",
						required: true,
						unique: true,
						references: {
							model: "user",
							field: "id",
							onDelete: "cascade",
						},
					},
					signingPublicKey: {
						type: "string",
						required: true,
						unique: true,
					},
					fingerprint: {
						type: "string",
						required: true,
						unique: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
			/**
			 * Per-device OLM key bundle. One row per device, single JSON blob
			 * holding `{ device_keys, one_time_keys, fallback_keys }` exactly
			 * as published by the OlmMachine. Incremental OTK uploads merge
			 * into the JSON map in place — never spawn additional rows.
			 */
			olmDeviceKeys: {
				fields: {
					userId: {
						type: "string",
						required: true,
						references: {
							model: "user",
							field: "id",
							onDelete: "cascade",
						},
					},
					deviceId: {
						type: "string",
						required: true,
						unique: true,
					},
					bundleJson: {
						type: "string",
						required: true,
					},
					createdAt: {
						type: "date",
						required: true,
					},
					updatedAt: {
						type: "date",
						required: true,
					},
				},
			},
		},
		endpoints: {
			/**
			 * Register the user's stable identity public key.
			 *
			 * Called once when the client first generates its mnemonic-derived
			 * keypair. Subsequent calls upsert (so a client that re-derives the
			 * same key from the same mnemonic is idempotent), but the keys
			 * themselves should never change for a given user.
			 *
			 * Only public material is accepted; the body schema enforces this.
			 */
			registerIdentity: createAuthEndpoint("/oven/identity/register", {
				method: "POST",
				body: IdentityRegisterBodySchema,
			}, async (context) => {
				const session = await getSessionFromCtx(context);
				if (!session) {
					return context.json({ error: "Unauthorized" }, { status: 401 });
				}

				const { signingPublicKey, fingerprint } = context.body;
				const now = new Date();

				const checkIdentity = await db.select().from(userIdentityKeys).where(eq(userIdentityKeys.userId, session.user.id)).limit(1);
				if (checkIdentity.length > 0) {
					return context.json({ error: "Identity already registered, if you need to rotate your keys, please use the key rotation flow instead." }, { status: 400 });
				}

				await db.transaction(async (tx) => {
					const updated = await tx
						.update(userIdentityKeys)
						.set({ signingPublicKey, fingerprint, updatedAt: now })
						.where(eq(userIdentityKeys.userId, session.user.id))
						.returning({ id: userIdentityKeys.id });

					if (updated.length === 0) {
						await tx.insert(userIdentityKeys).values({
							id: crypto.randomUUID(),
							userId: session.user.id,
							signingPublicKey,
							fingerprint,
							createdAt: now,
							updatedAt: now,
						});
					}
				});

				return context.json({ success: true });
			}),

			/**
			 * Upload (or incrementally update) a device's OLM key bundle.
			 *
			 * Bundle structure persisted as `bundle_json`:
			 *   {
			 *     device_keys:    { ... full Matrix DeviceKeys ... },
			 *     one_time_keys:  { "<algo>:<id>": SignedKey, ... },
			 *     fallback_keys:  { "<algo>:<id>": SignedFallbackKey, ... },
			 *   }
			 *
			 * Matrix's incremental-upload semantics for OTKs/fallback keys are
			 * applied to the JSON map in place: a string value is treated as a
			 * "delete this key" marker, an object value adds/replaces the entry.
			 */
			keysUpload: createAuthEndpoint("/oven/keys/upload", {
				method: "POST",
				body: z.string().transform((val) => {
					const parsed = KeysUploadBodySchema.safeParse(JSON.parse(val));
					if (!parsed.success) {
						throw new Error(parsed.error.message);
					}
					return parsed.data;
				}),
			}, async (context) => {
				const session = await getSessionFromCtx(context);
				if (!session) {
					return context.json({ error: "Unauthorized" }, { status: 401 });
				}

				const { device_keys, one_time_keys, fallback_keys } = context.body;
				if (!device_keys) {
					return context.json({ error: "Device keys are required", code: "DEVICE_KEYS_REQUIRED" }, { status: 400 });
				}
				if (!one_time_keys) {
					return context.json({ error: "One time keys are required", code: "ONE_TIME_KEYS_REQUIRED" }, { status: 400 });
				}
				if (!fallback_keys) {
					return context.json({ error: "Fallback keys are required", code: "FALLBACK_KEYS_REQUIRED" }, { status: 400 });
				}

				const userId = session.user.id;
				const deviceId = device_keys.device_id;
				const now = new Date();

				let otkCount = 0;

				await db.transaction(async (tx) => {
					const [existing] = await tx
						.select({ bundleJson: olmDeviceKeys.bundleJson })
						.from(olmDeviceKeys)
						.where(eq(olmDeviceKeys.deviceId, deviceId))
						.limit(1);

					const previous: DeviceBundle = existing
						? (JSON.parse(existing.bundleJson) as DeviceBundle)
						: { device_keys, one_time_keys: {}, fallback_keys: {} };

					const mergedOtks: Record<string, SignedKey> = { ...previous.one_time_keys };
					for (const [keyId, value] of Object.entries(one_time_keys)) {
						if (typeof value === "string") {
							delete mergedOtks[keyId];
						} else {
							mergedOtks[keyId] = value;
						}
					}

					const mergedFallback: Record<string, SignedFallbackKey> = { ...previous.fallback_keys };
					for (const [keyId, value] of Object.entries(fallback_keys)) {
						if (typeof value === "string") {
							delete mergedFallback[keyId];
						} else {
							mergedFallback[keyId] = value;
						}
					}

					const bundleJson = JSON.stringify({
						device_keys,
						one_time_keys: mergedOtks,
						fallback_keys: mergedFallback,
					} satisfies DeviceBundle);

					if (existing) {
						await tx
							.update(olmDeviceKeys)
							.set({ bundleJson, updatedAt: now })
							.where(eq(olmDeviceKeys.deviceId, deviceId));
					} else {
						await tx.insert(olmDeviceKeys).values({
							id: crypto.randomUUID(),
							userId,
							deviceId,
							bundleJson,
							createdAt: now,
							updatedAt: now,
						});
					}

					otkCount = Object.keys(mergedOtks).length;
				});

				return context.json({
					success: true,
					one_time_key_counts: {
						signed_curve25519: otkCount,
					},
				});
			}),

			/**
			 * Returns whether the authenticated user has registered their
			 * mnemonic-derived identity public key with the server.
			 *
			 * Always responds 200 so the caller doesn't have to disambiguate
			 * "not registered" from a transport error.
			 */
			checkIdentity: createAuthEndpoint("/oven/identity/check", {
				method: "GET",
			}, async (context) => {
				const session = await getSessionFromCtx(context);
				if (!session) {
					return context.json({ error: "Unauthorized" }, { status: 401 });
				}

				const [identity] = await db
					.select({ id: userIdentityKeys.id })
					.from(userIdentityKeys)
					.where(eq(userIdentityKeys.userId, session.user.id))
					.limit(1);

				return context.json({ exists: !!identity });
			}),
		},
	} satisfies BetterAuthPlugin;
};
