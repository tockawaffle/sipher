import db from "@/lib/db";
import { serverRegistry } from "@/lib/db/schema";
import { decryptPayload, fingerprintKey } from "@/lib/federation/keytools";
import { assertSafeUrl, UrlGuardError } from "@/lib/federation/url-guard";
import createDebug from "debug";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const debug = createDebug("app:discover");

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

const signingKeySchema = z.string().refine(
	(key) => isValidBase64Key(key, ED25519_PUBLIC_KEY_BYTES),
	{ message: `Signing public key must be a base64-encoded Ed25519 key (${ED25519_PUBLIC_KEY_BYTES} bytes)` },
);

const encryptionKeySchema = z.string().refine(
	(key) => isValidBase64Key(key, X25519_PUBLIC_KEY_BYTES),
	{ message: `Encryption public key must be a base64-encoded X25519 key (${X25519_PUBLIC_KEY_BYTES} bytes)` },
);

function getOwnEncryptionSecretKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PRIVATE_KEY!, "base64"));
}

const discoverSchema = z.object({
	method: z.literal("DISCOVER"),
	publicKey: signingKeySchema,
	encryptionPublicKey: encryptionKeySchema,
	envelope: z.object({
		ephemeralPublicKey: z.string(),
		iv: z.string(),
		ciphertext: z.string(),
		authTag: z.string(),
	}),
}).superRefine((data, ctx) => {
	try {
		const decrypted = decryptPayload(data.envelope, getOwnEncryptionSecretKey());
		const parsed = JSON.parse(decrypted);
		if (parsed.publicKeyFingerprint !== fingerprintKey(data.publicKey)) {
			ctx.addIssue({ code: "custom", message: "Envelope does not match the provided signing public key" });
		}
		if (parsed.encryptionPublicKeyFingerprint !== fingerprintKey(data.encryptionPublicKey)) {
			ctx.addIssue({ code: "custom", message: "Envelope does not match the provided encryption public key" });
		}
		if (!parsed.url) {
			ctx.addIssue({ code: "custom", message: "Envelope is missing the url field" });
		}
	} catch {
		ctx.addIssue({ code: "custom", message: "Invalid envelope" });
	}
});

const registerSchema = z.object({
	method: z.literal("REGISTER"),
	url: z.url(),
	publicKey: signingKeySchema,
	encryptionPublicKey: encryptionKeySchema,
});

export async function GET() {
	debug("GET /discover – fetching healthy peers");
	const peers = await db.select({
		url: serverRegistry.url,
		isHealthy: serverRegistry.isHealthy,
	}).from(serverRegistry).where(eq(serverRegistry.isHealthy, true)).orderBy(desc(serverRegistry.lastSeen));
	debug("GET /discover – found %d peer(s)", peers.length);

	return NextResponse.json({
		url: process.env.BETTER_AUTH_URL!,
		publicKey: process.env.FEDERATION_PUBLIC_KEY,
		encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY,
		peers,
	});
}

async function upsertServer(url: string, publicKey: string, encryptionPublicKey: string) {
	return await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url,
		publicKey,
		encryptionPublicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
	}).onConflictDoNothing();
}

async function discoverServer(validated: z.infer<typeof discoverSchema>) {
	debug("DISCOVER – looking up server by public key");
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.publicKey, validated.publicKey));
	if (server.length === 0) {
		debug("DISCOVER – server not found");
		return NextResponse.json({ error: "Server not found" }, { status: 404 });
	}

	try {
		if (process.env.NODE_ENV !== "development") {
			assertSafeUrl(server[0].url);
		}
	} catch (err) {
		debug("DISCOVER – stored URL failed SSRF check: %s", server[0].url);
		if (err instanceof UrlGuardError) {
			return NextResponse.json({ error: "Stored server URL is blocked" }, { status: 400 });
		}
		throw err;
	}

	const confirmations = {
		sameKeyOnServer: false,
		sameKeyOnFetch: false,
	}

	if (server[0].publicKey === validated.publicKey) confirmations.sameKeyOnServer = true;
	debug("DISCOVER – fetching public key from federation server %s", server[0].url);
	try {
		const federationResponse = await (await fetch(server[0].url + "/discover")).json();
		if (federationResponse.publicKey === validated.publicKey) confirmations.sameKeyOnFetch = true;
	} catch (err) {
		debug("DISCOVER – fetch to %s failed: %o", server[0].url, err);
		return NextResponse.json({ error: "Failed to reach the federation server" }, { status: 502 });
	}

	debug("DISCOVER – confirmations: %o", confirmations);
	return NextResponse.json(confirmations);
}

async function registerServer(validated: z.infer<typeof registerSchema>) {
	try {
		if (process.env.NODE_ENV !== "development") {
			assertSafeUrl(validated.url);
		}
	} catch (err) {
		debug("REGISTER – URL failed SSRF check: %s", validated.url);
		if (err instanceof UrlGuardError) {
			return NextResponse.json({ error: err.message }, { status: 400 });
		}
		throw err;
	}

	debug("REGISTER – fetching /discover from %s to validate server", validated.url);
	let response: { publicKey?: string; encryptionPublicKey?: string };
	try {
		response = await (await fetch(validated.url + "/discover")).json();
	} catch (err) {
		debug("REGISTER – fetch to %s failed: %o", validated.url, err);
		return NextResponse.json({ error: "Failed to reach the server" }, { status: 502 });
	}

	if (!response.publicKey || !response.encryptionPublicKey) {
		debug("REGISTER – remote server returned incomplete keys");
		return NextResponse.json({ error: "Invalid server" }, { status: 400 });
	} else if (response.publicKey !== validated.publicKey || response.encryptionPublicKey !== validated.encryptionPublicKey) {
		debug("REGISTER – key mismatch: provided vs fetched");
		return NextResponse.json({ error: "Public keys do not match the ones reported by the server" }, { status: 400 });
	}

	debug("REGISTER – checking for existing registration at %s", validated.url);
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.url, validated.url.toString()));
	if (server.length > 0 && server[0].publicKey !== validated.publicKey) {
		debug("REGISTER – key mismatch against existing registration");
		return NextResponse.json({ error: "Your public key does not match the one registered on the server, to update your public key, please use the key rotation flow instead." }, { status: 400 });
	}

	debug("REGISTER – upserting server %s", validated.url);
	await upsertServer(validated.url.toString(), validated.publicKey, validated.encryptionPublicKey);

	debug("REGISTER – server registered successfully");
	return NextResponse.json({
		message: "Server registered successfully", echo: {
			url: process.env.BETTER_AUTH_URL!,
			publicKey: process.env.FEDERATION_PUBLIC_KEY,
			encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY,
		}
	});
}

export async function POST(request: NextRequest) {
	const body = await request.json();
	debug("POST /discover – method: %s", body?.method);

	if (body?.method === "DISCOVER") {
		const validated = discoverSchema.safeParse(body);
		if (!validated.success) {
			debug("POST /discover – DISCOVER validation failed: %o", validated.error.message);
			return NextResponse.json({ error: validated.error.message }, { status: 400 });
		}
		return await discoverServer(validated.data);
	}

	if (body?.method === "REGISTER") {
		const validated = registerSchema.safeParse(body);
		if (!validated.success) {
			debug("POST /discover – REGISTER validation failed: %o", validated.error.message);
			return NextResponse.json({ error: validated.error.message }, { status: 400 });
		}
		return await registerServer(validated.data);
	}

	return NextResponse.json({ error: "Invalid method" }, { status: 400 });
}
