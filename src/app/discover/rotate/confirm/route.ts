import db from "@/lib/db";
import { blacklistedServers, rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { decryptPayload, verifySignature } from "@/lib/federation/keytools";
import { isJsonObjectBody } from "@/lib/http/json-object-body";
import createDebug from "debug";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const debug = createDebug("app:discover:rotate:confirm");

/**
 * Confirms a key rotation challenge issued by /discover/rotate/init.
 *
 * Terminology: SA = this server (Server A), SB = the server rotating its keys (Server B).
 *
 * Full rotation flow:
 * 1. SB generates new Ed25519 + X25519 keypairs.
 * 2. SB sends { url, newSigningPublicKey, newEncryptionPublicKey } to SA's /discover/rotate/init.
 * 3. SA issues 4 challenges:
 *    - signingOldChallenge: plaintext nonce (SB signs with old Ed25519 key)
 *    - signingNewChallenge: plaintext nonce (SB signs with new Ed25519 key)
 *    - encryptionOldChallenge: nonce encrypted with SB's current X25519 key
 *    - encryptionNewChallenge: nonce encrypted with SB's new X25519 key
 * 4. SB solves all 4 challenges:
 *    - Signs the signing challenges with respective Ed25519 keys
 *    - Decrypts the encryption challenges with respective X25519 keys
 * 5. SB fetches SA's /discover to get SA's X25519 public key, then encrypts
 *    all 4 proof values into a single EncryptedEnvelope using SA's X25519 key.
 * 6. SA decrypts the envelope and verifies all 4 proofs.
 *
 * What each check proves:
 * - signingOldSignature: SB holds the old Ed25519 private key (identity proof)
 * - signingNewSignature: SB holds the new Ed25519 private key (ownership proof)
 * - encryptionOldPlaintext: SB holds the old X25519 private key (encryption identity proof)
 * - encryptionNewPlaintext: SB holds the new X25519 private key (encryption ownership proof)
 * - Envelope encrypted with SA's X25519 key: SB fetched SA's /discover (identity binding)
 */
export async function POST(request: NextRequest) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
	}
	if (!isJsonObjectBody(body)) {
		return NextResponse.json({ error: "Invalid JSON", code: "INVALID_JSON" }, { status: 400 });
	}
	debug("POST /discover/rotate/confirm – confirmation request for %s", (body as { serverUrl?: string }).serverUrl);

	const validated = z.object({
		serverUrl: z.url(),
		envelope: z.object({
			ephemeralPublicKey: z.string(),
			iv: z.string(),
			ciphertext: z.string(),
			authTag: z.string(),
		}),
	}).safeParse(body);

	if (!validated.success) {
		debug("POST /discover/rotate/confirm – validation failed: %o", validated.error.message);
		return NextResponse.json({ error: validated.error.message }, { status: 400 });
	}

	const [blacklisted] = await db.select().from(blacklistedServers)
		.where(eq(blacklistedServers.serverUrl, validated.data.serverUrl));
	if (blacklisted) {
		debug("POST /discover/rotate/confirm – server %s is blacklisted", validated.data.serverUrl);
		return NextResponse.json({ error: "Your server has been blacklisted. Please contact support to unblacklist your server." }, { status: 403 });
	}

	debug("POST /discover/rotate/confirm – fetching pending challenge for %s", validated.data.serverUrl);

	return await db.transaction(async (tx) => {
		const [challenge] = await tx.select().from(rotateChallengeTokens)
			.where(eq(rotateChallengeTokens.serverUrl, validated.data.serverUrl))
			.for("update");

		if (!challenge) {
			debug("POST /discover/rotate/confirm – no pending challenge found");
			return NextResponse.json({ error: "No pending rotation challenge found for this server." }, { status: 404 });
		}

		if (challenge.expiresAt < new Date()) {
			debug("POST /discover/rotate/confirm – challenge expired at %s", challenge.expiresAt.toISOString());
			await tx.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({ error: "Challenge token has expired." }, { status: 400 });
		}

		if (challenge.attemptsLeft <= 0) {
			// Cancel the challenge without blacklisting the server. Blacklisting
			// here would be unsafe because anyone can open an init challenge for
			// an arbitrary server URL — auto-blacklisting on failed confirms
			// lets an attacker permanently ban a legitimate peer with no effort.
			debug("POST /discover/rotate/confirm – no attempts left, cancelling challenge for %s", challenge.serverUrl);
			await tx.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({
				error: "Too many failed attempts. The rotation challenge has been cancelled. Please initiate a new rotation.",
			}, { status: 403 });
		}

		debug("POST /discover/rotate/confirm – %d attempt(s) left, decrypting envelope", challenge.attemptsLeft);

		const ownEncryptionSecretKey = new Uint8Array(
			Buffer.from(process.env.FEDERATION_ENCRYPTION_PRIVATE_KEY!, "base64"),
		);

		let proofs: {
			signingOldSignature: string;
			signingNewSignature: string;
			encryptionOldPlaintext: string;
			encryptionNewPlaintext: string;
		};
		try {
			const decrypted = decryptPayload(validated.data.envelope, ownEncryptionSecretKey);
			proofs = JSON.parse(decrypted);
		} catch {
			debug("POST /discover/rotate/confirm – envelope decryption failed, decrementing attempts");
			await tx.update(rotateChallengeTokens).set({
				attemptsLeft: sql`${rotateChallengeTokens.attemptsLeft} - 1`,
			}).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({
				error: `Failed to decrypt envelope. You have ${challenge.attemptsLeft - 1} attempt(s) left.`,
			}, { status: 400 });
		}

		const [server] = await tx.select().from(serverRegistry)
			.where(eq(serverRegistry.url, challenge.serverUrl));

		if (!server) {
			debug("POST /discover/rotate/confirm – server not found in registry");
			return NextResponse.json({ error: "Server not found in registry." }, { status: 404 });
		}

		const currentSigningPub = new Uint8Array(Buffer.from(server.publicKey, "base64"));
		const newSigningPub = new Uint8Array(Buffer.from(challenge.newSigningPublicKey, "base64"));

		const signingOldValid = verifySignature(
			challenge.signingOldToken,
			proofs.signingOldSignature,
			currentSigningPub,
		);
		const signingNewValid = verifySignature(
			challenge.signingNewToken,
			proofs.signingNewSignature,
			newSigningPub,
		);
		const encOldValid = proofs.encryptionOldPlaintext === challenge.encryptionOldToken;
		const encNewValid = proofs.encryptionNewPlaintext === challenge.encryptionNewToken;

		if (!signingOldValid || !signingNewValid || !encOldValid || !encNewValid) {
			debug(
				"POST /discover/rotate/confirm – proof mismatch (sigOld=%s, sigNew=%s, encOld=%s, encNew=%s), decrementing",
				signingOldValid ? "ok" : "FAIL",
				signingNewValid ? "ok" : "FAIL",
				encOldValid ? "ok" : "FAIL",
				encNewValid ? "ok" : "FAIL",
			);
			await tx.update(rotateChallengeTokens).set({
				attemptsLeft: sql`${rotateChallengeTokens.attemptsLeft} - 1`,
			}).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({
				error: `Challenge verification failed. You have ${challenge.attemptsLeft - 1} attempt(s) left.`,
			}, { status: 400 });
		}

		debug("POST /discover/rotate/confirm – all 4 proofs passed, rotating keys for %s", challenge.serverUrl);
		await tx.update(serverRegistry).set({
			publicKey: challenge.newSigningPublicKey,
			encryptionPublicKey: challenge.newEncryptionPublicKey,
			updatedAt: new Date(),
		}).where(eq(serverRegistry.url, challenge.serverUrl));

		await tx.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, challenge.id));

		debug("POST /discover/rotate/confirm – key rotation complete for %s", challenge.serverUrl);
		return NextResponse.json({ message: "Key rotation confirmed successfully." });
	});
}
