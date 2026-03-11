import db from "@/lib/db";
import { blacklistedServers, rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { decryptPayload } from "@/lib/federation/keytools";
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
 * 1. SB generates a new keypair. It keeps the old private key accessible until rotation is complete.
 * 2. SB sends { url, newPublicKey } to SA's /discover/rotate/init.
 * 3. SA issues two independent challenges and returns them to SB:
 *    - oldKeyChallenge: a random token encrypted with SB's CURRENT (old) public key.
 *    - newKeyChallenge: a random token encrypted with SB's NEW public key.
 * 4. SB decrypts both challenges using the respective private keys:
 *    - oldKeyChallenge → decrypted with old private key → oldPlaintext
 *    - newKeyChallenge → decrypted with new private key → newPlaintext
 * 5. SB fetches SA's public key from /discover, then re-encrypts both plaintexts with it:
 *    - signedOldChallenge = encrypt(oldPlaintext, SA.publicKey)
 *    - signedNewChallenge = encrypt(newPlaintext, SA.publicKey)
 * 6. SB sends { serverUrl, signedOldChallenge, signedNewChallenge } to this route.
 * 7. SA decrypts both with its own private key and compares to the stored tokens.
 *    - If either mismatches: decrement attemptsLeft; blacklist server at 0 attempts.
 *    - If both match: update serverRegistry with newPublicKey and delete the challenge.
 *
 * What each check proves:
 * - signedOldChallenge match → SB holds the old private key (identity proof: "they are who they say they are")
 * - signedNewChallenge match → SB holds the new private key (ownership proof: "they own the key they want to rotate to")
 * - re-encryption with SA's public key → SB fetched SA's identity from /discover
 *
 * TODO: on success, announce the completed rotation to other known federation peers
 * so they can treat SA as a trusted proxy for confirming SB's new key. (Other federation servers could ignore this information and force the challenge to be completed for themselves.)
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	debug("POST /discover/rotate/confirm – confirmation request for %s", body?.serverUrl);

	const validated = z.object({
		serverUrl: z.url(),
		// SA decrypted oldKeyChallenge with their OLD private key,
		// then re-encrypted the plaintext with OUR public key.
		signedOldChallenge: z.string(),
		// SA decrypted newKeyChallenge with their NEW private key,
		// then re-encrypted the plaintext with OUR public key.
		signedNewChallenge: z.string(),
	}).safeParse(body);

	if (!validated.success) {
		debug("POST /discover/rotate/confirm – validation failed: %o", validated.error.message);
		return NextResponse.json({ error: validated.error.message }, { status: 400 });
	}

	debug("POST /discover/rotate/confirm – fetching pending challenge for %s", validated.data.serverUrl);

	// transaction to ensure that the challenge is deleted and the server registry is updated atomically and that there's no race condition.
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
			debug("POST /discover/rotate/confirm – no attempts left, blacklisting %s", challenge.serverUrl);
			await tx.insert(blacklistedServers).values({
				id: crypto.randomUUID(),
				serverUrl: challenge.serverUrl,
				reason: "Too many failed attempts to confirm key rotation challenge",
				createdAt: new Date(),
			});
			await tx.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({ error: "Your server has been blacklisted. Please contact support to unblacklist your server." }, { status: 403 });
		}

		debug("POST /discover/rotate/confirm – %d attempt(s) left, decrypting challenges", challenge.attemptsLeft);
		let decryptedOld: string;
		let decryptedNew: string;
		try {
			decryptedOld = decryptPayload(validated.data.signedOldChallenge, process.env.FEDERATION_PRIVATE_KEY!);
			decryptedNew = decryptPayload(validated.data.signedNewChallenge, process.env.FEDERATION_PRIVATE_KEY!);
		} catch {
			debug("POST /discover/rotate/confirm – decryption failed, decrementing attempts");
			await tx.update(rotateChallengeTokens).set({
				attemptsLeft: sql`${rotateChallengeTokens.attemptsLeft} - 1`,
			}).where(eq(rotateChallengeTokens.id, challenge.id))
			return NextResponse.json({
				error: `Failed to decrypt one or both challenges. You have ${challenge.attemptsLeft - 1} attempts left before your server is blacklisted.`,
			}, { status: 400 });
		}

		if (decryptedOld !== challenge.oldKeyToken || decryptedNew !== challenge.newKeyToken) {
			debug("POST /discover/rotate/confirm – token mismatch (old=%s, new=%s), decrementing attempts",
				decryptedOld === challenge.oldKeyToken ? "ok" : "MISMATCH",
				decryptedNew === challenge.newKeyToken ? "ok" : "MISMATCH",
			);
			await tx.update(rotateChallengeTokens).set({
				attemptsLeft: sql`${rotateChallengeTokens.attemptsLeft} - 1`,
			}).where(eq(rotateChallengeTokens.id, challenge.id));
			return NextResponse.json({
				error: `Challenge mismatch. You have ${challenge.attemptsLeft - 1} attempts left before your server is blacklisted.`,
			}, { status: 400 });
		}

		debug("POST /discover/rotate/confirm – both challenges passed, rotating key for %s", challenge.serverUrl);
		await tx.update(serverRegistry).set({
			publicKey: challenge.newPublicKey,
			updatedAt: new Date(),
		}).where(eq(serverRegistry.url, challenge.serverUrl));

		await tx.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, challenge.id));

		debug("POST /discover/rotate/confirm – key rotation complete for %s", challenge.serverUrl);
		return NextResponse.json({ message: "Key rotation confirmed successfully." });
	});
}
