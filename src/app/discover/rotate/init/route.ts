import db from "@/lib/db";
import { rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { encryptPayload } from "@/lib/federation/keytools";
import createDebug from "debug";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { z } from "zod";

const debug = createDebug("app:discover:rotate:init");

const publicKeySchema = z.string().refine((key) => {
	try {
		const pub = forge.pki.publicKeyFromPem(key);
		return pub.n.bitLength() >= 4096;
	} catch {
		return false;
	}
}, { message: "Invalid public key" });

const schema = z.object({
	url: z.url(),
	newPublicKey: publicKeySchema,
});

/**
 * Initializes a key rotation challenge for a server.
 *
 * This route is used to initiate the key rotation process. It will issue two independent challenges:
 * - oldKeyChallenge: a random token encrypted with the server's current public key.
 * - newKeyChallenge: a random token encrypted with the server's new public key.
 *
 * The challenges are stored in the database and will expire in 5 minutes.
 *
 * The challenges are returned to the client and must be decrypted using the respective private keys.
 *
 * The client must then send the challenges to the server's /discover/rotate/confirm route to confirm the key rotation.
 * 
 * The server will not send his current public key to the client, the client must fetch it from the server's /discover route as a part of the challenge validation.
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	debug("POST /discover/rotate/init – rotation request for %s", body?.url);

	const validated = schema.safeParse(body);
	if (!validated.success) {
		debug("POST /discover/rotate/init – validation failed: %o", validated.error.message);
		return NextResponse.json({ error: validated.error.message }, { status: 400 });
	}

	debug("POST /discover/rotate/init – looking up server %s", validated.data.url);
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.url, validated.data.url.toString()));
	if (server.length === 0) {
		debug("POST /discover/rotate/init – server not found");
		return NextResponse.json({ error: "Server not found, please register your server first." }, { status: 404 });
	}

	if (server[0].publicKey === validated.data.newPublicKey) {
		debug("POST /discover/rotate/init – new key is identical to current key, rejecting");
		return NextResponse.json({ error: "Your server is already registered with this public key." }, { status: 400 });
	}

	// Check for existing pending challenges, only one active challenge per server is allowed.
	// This got removed by accident on a previous commit.
	const [existing] = await db.select().from(rotateChallengeTokens)
		.where(eq(rotateChallengeTokens.serverUrl, validated.data.url.toString()));

	if (existing) {
		if (existing.expiresAt > new Date()) {
			debug("POST /discover/rotate/init – active challenge already exists, rejecting");
			return NextResponse.json(
				{ error: "A rotation challenge is already pending for this server." },
				{ status: 409 },
			);
		}
		debug("POST /discover/rotate/init – deleting expired challenge");
		await db.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.id, existing.id));
	}

	// Issue two independent challenges:
	//
	// oldKeyChallenge — encrypted with the SA's CURRENT registered public key.
	// Only the holder of the current private key can decrypt this.
	// This is the identity proof: it shows the requester really is the
	// registered server and not someone who merely knows its URL.
	//
	// newKeyChallenge — encrypted with the submitted new public key.
	// Only the holder of the new private key can decrypt this.
	// This proves the SA actually owns the key they want to rotate to.
	//
	// Both plaintexts are stored. On confirm the SA must re-encrypt both
	// with OUR public key so we can decrypt and compare — proving they
	// fetched our identity as well.
	const oldKeyPlaintext = crypto.randomUUID();
	const newKeyPlaintext = crypto.randomUUID();

	debug("POST /discover/rotate/init – issuing challenges for server %s", validated.data.url);
	const oldKeyChallenge = encryptPayload(oldKeyPlaintext, server[0].publicKey);
	const newKeyChallenge = encryptPayload(newKeyPlaintext, validated.data.newPublicKey);

	await db.insert(rotateChallengeTokens).values({
		id: crypto.randomUUID(),
		oldKeyToken: oldKeyPlaintext,
		newKeyToken: newKeyPlaintext,
		newPublicKey: validated.data.newPublicKey,
		serverUrl: validated.data.url.toString(),
		createdAt: new Date(),
		expiresAt: new Date(Date.now() + 1000 * 60 * 5),
	});

	debug("POST /discover/rotate/init – challenges issued, expires in 5 minutes");
	return NextResponse.json({ oldKeyChallenge, newKeyChallenge });
}
