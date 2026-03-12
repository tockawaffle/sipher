import db from "@/lib/db";
import { blacklistedServers, rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { encryptPayload } from "@/lib/federation/keytools";
import createDebug from "debug";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const debug = createDebug("app:discover:rotate:init");

const ED25519_PUBLIC_KEY_BYTES = 32;
const X25519_PUBLIC_KEY_BYTES = 32;

function isValidBase64Key(key: string, expectedBytes: number): boolean {
	try {
		const decoded = Buffer.from(key, "base64");
		return decoded.length === expectedBytes;
	} catch {
		return false;
	}
}

const schema = z.object({
	url: z.url(),
	newSigningPublicKey: z.string().refine(
		(key) => isValidBase64Key(key, ED25519_PUBLIC_KEY_BYTES),
		{ message: "Invalid Ed25519 signing public key" },
	),
	newEncryptionPublicKey: z.string().refine(
		(key) => isValidBase64Key(key, X25519_PUBLIC_KEY_BYTES),
		{ message: "Invalid X25519 encryption public key" },
	),
});

/**
 * Initializes a key rotation challenge for a server.
 *
 * Issues 4 independent challenges:
 * - signingOldChallenge: plaintext nonce (SB signs with old Ed25519 key)
 * - signingNewChallenge: plaintext nonce (SB signs with new Ed25519 key)
 * - encryptionOldChallenge: nonce encrypted with SB's current X25519 key (SB decrypts)
 * - encryptionNewChallenge: nonce encrypted with SB's new X25519 key (SB decrypts)
 *
 * Challenges expire in 5 minutes. SB confirms via /discover/rotate/confirm.
 */
export async function POST(request: NextRequest) {
	const body = await request.json();
	debug("POST /discover/rotate/init – rotation request for %s", body?.url);

	const validated = schema.safeParse(body);
	if (!validated.success) {
		debug("POST /discover/rotate/init – validation failed: %o", validated.error.message);
		return NextResponse.json({ error: validated.error.message }, { status: 400 });
	}

	const [blacklisted] = await db.select().from(blacklistedServers)
		.where(eq(blacklistedServers.serverUrl, validated.data.url.toString()));
	if (blacklisted) {
		debug("POST /discover/rotate/init – server %s is blacklisted", validated.data.url);
		return NextResponse.json({ error: "Your server has been blacklisted." }, { status: 403 });
	}

	debug("POST /discover/rotate/init – looking up server %s", validated.data.url);
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.url, validated.data.url.toString()));
	if (server.length === 0) {
		debug("POST /discover/rotate/init – server not found");
		return NextResponse.json({ error: "Server not found, please register your server first." }, { status: 404 });
	}

	if (
		server[0].publicKey === validated.data.newSigningPublicKey &&
		server[0].encryptionPublicKey === validated.data.newEncryptionPublicKey
	) {
		debug("POST /discover/rotate/init – keys are identical to current keys, rejecting");
		return NextResponse.json({ error: "Your server is already registered with these keys." }, { status: 400 });
	}

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

	const signingOldPlaintext = crypto.randomUUID();
	const signingNewPlaintext = crypto.randomUUID();
	const encryptionOldPlaintext = crypto.randomUUID();
	const encryptionNewPlaintext = crypto.randomUUID();

	debug("POST /discover/rotate/init – issuing 4 challenges for server %s", validated.data.url);

	const currentEncPubKey = new Uint8Array(Buffer.from(server[0].encryptionPublicKey, "base64"));
	const newEncPubKey = new Uint8Array(Buffer.from(validated.data.newEncryptionPublicKey, "base64"));

	const encryptionOldChallenge = encryptPayload(encryptionOldPlaintext, currentEncPubKey);
	const encryptionNewChallenge = encryptPayload(encryptionNewPlaintext, newEncPubKey);

	await db.insert(rotateChallengeTokens).values({
		id: crypto.randomUUID(),
		signingOldToken: signingOldPlaintext,
		signingNewToken: signingNewPlaintext,
		encryptionOldToken: encryptionOldPlaintext,
		encryptionNewToken: encryptionNewPlaintext,
		newSigningPublicKey: validated.data.newSigningPublicKey,
		newEncryptionPublicKey: validated.data.newEncryptionPublicKey,
		serverUrl: validated.data.url.toString(),
		createdAt: new Date(),
		expiresAt: new Date(Date.now() + 1000 * 60 * 5),
	});

	debug("POST /discover/rotate/init – challenges issued, expires in 5 minutes");
	const response = {
		signingOldChallenge: signingOldPlaintext,
		signingNewChallenge: signingNewPlaintext,
		encryptionOldChallenge,
		encryptionNewChallenge,
	}
	debug("POST /discover/rotate/init – response: %o", response);
	return NextResponse.json(response);
}
