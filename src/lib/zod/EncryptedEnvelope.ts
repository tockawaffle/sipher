import { z, type ZodType } from "zod";
import { decryptPayload, getOwnEncryptionSecretKey } from "../federation/keytools";

/**
 * Raw envelope shape — validates the four ECIES fields without decrypting.
 * Use this when you only need to confirm the envelope structure (e.g. a proxy
 * that forwards opaque ciphertext without access to the recipient's key).
 */
export const EncryptedEnvelopeBaseSchema = z.object({
	ephemeralPublicKey: z.string(),
	iv: z.string(),
	ciphertext: z.string(),
	authTag: z.string(),
});

/**
 * Factory that returns an envelope schema which decrypts the ciphertext and
 * validates the resulting plaintext against {@link innerSchema}.
 *
 * The output type is `z.infer<T> & { _raw: string }` — the parsed inner
 * payload plus the raw decrypted JSON string (useful for signature verification).
 */
export function createEncryptedEnvelopeSchema<T extends ZodType>(innerSchema: T) {
	return EncryptedEnvelopeBaseSchema.transform((payload, ctx) => {
		try {
			const decrypted = decryptPayload(payload, getOwnEncryptionSecretKey());
			const parsed = innerSchema.safeParse(JSON.parse(decrypted));

			if (!parsed.success) {
				ctx.addIssue({ code: "custom", message: parsed.error.issues.map(i => i.message).join("; ") });
				return z.NEVER;
			}

			return Object.assign({}, parsed.data as z.infer<T>, { _raw: decrypted });
		} catch {
			ctx.addIssue({ code: "custom", message: "Decryption failed" });
			return z.NEVER;
		}
	});
}
