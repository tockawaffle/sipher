import { z } from "zod";

/**
 * Matrix-flavoured unpadded base64 for a 32-byte Curve25519/Ed25519 public key.
 * 32 raw bytes encode to exactly 43 base64 characters (no padding).
 *
 * Anything longer (e.g. a 64-byte NaCl secret key → 86 chars) or shorter is
 * rejected, which is our cheap defence against a client trying to upload
 * private key material in a field that should only hold a public key.
 */
const OLM_PUBLIC_KEY = z
	.string()
	.regex(/^[A-Za-z0-9+/]{43}$/, "Must be unpadded base64 of a 32-byte public key");

const SignaturesSchema = z.record(
	z.string(),
	z.record(z.string(), z.string()),
);

const DeviceKeysSchema = z.object({
	user_id: z.string(),
	device_id: z.string(),
	algorithms: z.array(z.string()),
	keys: z.record(z.string(), OLM_PUBLIC_KEY),
	signatures: SignaturesSchema,
});

export const SignedKeySchema = z.object({
	key: OLM_PUBLIC_KEY,
	signatures: SignaturesSchema,
});

export const SignedFallbackKeySchema = z.object({
	key: OLM_PUBLIC_KEY,
	fallback: z.literal(true),
	signatures: SignaturesSchema,
});

export type SignedKey = z.infer<typeof SignedKeySchema>;
export type SignedFallbackKey = z.infer<typeof SignedFallbackKeySchema>;

export const KeysUploadBodySchema = z
	.object({
		device_keys: DeviceKeysSchema.optional(),
		one_time_keys: z
			.record(z.string(), z.union([z.string(), SignedKeySchema]))
			.optional(),
		fallback_keys: z
			.record(z.string(), z.union([z.string(), SignedFallbackKeySchema]))
			.optional(),
	})
	.refine(
		(b) =>
			b.device_keys !== undefined ||
			b.one_time_keys !== undefined ||
			b.fallback_keys !== undefined,
		{ message: "At least one of device_keys, one_time_keys, or fallback_keys must be present" },
	);

export type KeysUploadBody = z.infer<typeof KeysUploadBodySchema>;

/**
 * Body for `POST /oven/identity/register`.
 *
 * Carries the user's stable per-account identity material derived client-side
 * from their BIP-39 mnemonic. Both fields are public; the corresponding secret
 * key never leaves the client's encrypted Dexie store.
 *
 * - `signingPublicKey`: base58 of the Ed25519 verification key.
 * - `fingerprint`: base58 of the same public key (kept distinct so we can later
 *   migrate to a separate human-readable fingerprint format without breaking
 *   the wire schema).
 */
export const IdentityRegisterBodySchema = z.object({
	signingPublicKey: z.string().min(1),
	fingerprint: z.string().min(1),
});

export type IdentityRegisterBody = z.infer<typeof IdentityRegisterBodySchema>;
