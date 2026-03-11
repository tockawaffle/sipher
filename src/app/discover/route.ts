import db from "@/lib/db";
import { serverRegistry } from "@/lib/db/schema";
import { decryptPayload } from "@/lib/federation/keytools";
import { assertSafeUrl, UrlGuardError } from "@/lib/federation/url-guard";
import createDebug from "debug";
import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { z } from "zod";

const debug = createDebug("app:discover");

export async function GET() {
	debug("GET /discover – fetching healthy peers");
	const peers = await db.select({
		url: serverRegistry.url,
		isHealthy: serverRegistry.isHealthy,
	}).from(serverRegistry).where(eq(serverRegistry.isHealthy, true)).orderBy(desc(serverRegistry.lastSeen));
	debug("GET /discover – found %d peer(s)", peers.length);

	return NextResponse.json({
		url: process.env.BETTER_AUTH_URL,
		publicKey: process.env.FEDERATION_PUBLIC_KEY,
		peers
	});
}

async function upsertServer(url: string, publicKey: string) {
	return await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url: url,
		publicKey: publicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
	}).onConflictDoNothing();
}

const publicKeySchema = z.string().superRefine((key, ctx) => {
	let pub: forge.pki.rsa.PublicKey;
	try {
		pub = forge.pki.publicKeyFromPem(key) as forge.pki.rsa.PublicKey;
	} catch {
		ctx.addIssue({ code: "custom", message: "Public key is not a valid PEM-encoded RSA key", input: key });
		return;
	}
	if (!pub.n) {
		ctx.addIssue({ code: "custom", message: "Public key is not an RSA key", input: key });
		return;
	}
	if (pub.n.bitLength() < 2048) {
		ctx.addIssue({ code: "custom", message: `RSA key must be at least 2048 bits (got ${pub.n.bitLength()})`, input: key });
	}
});

function fingerprintKey(pem: string): string {
	const md = forge.md.sha256.create();
	md.update(pem, "utf8");
	return md.digest().toHex();
}

const discoverSchema = z.object({
	method: z.literal("DISCOVER"),
	publicKey: publicKeySchema,
	signature: z.string(),
}).superRefine((data, ctx) => {
	try {
		const decrypted = decryptPayload(data.signature, process.env.FEDERATION_PRIVATE_KEY!);
		const parsed = JSON.parse(decrypted);
		// The signature contains a SHA-256 fingerprint of the public key
		// (since the full PEM exceeds RSA-OAEP's size limit) plus a url.
		if (parsed.publicKeyFingerprint !== fingerprintKey(data.publicKey)) {
			ctx.addIssue({ code: "custom", message: "Signature does not match the provided public key" });
		}
		if (!parsed.url) {
			ctx.addIssue({ code: "custom", message: "Signature is missing the url field" });
		}
	} catch {
		ctx.addIssue({ code: "custom", message: "Invalid signature" });
	}
});

const registerSchema = z.object({
	method: z.literal("REGISTER"),
	url: z.url(),
	publicKey: publicKeySchema,
});

async function discoverServer(validated: z.infer<typeof discoverSchema>) {
	debug("DISCOVER – looking up server by public key");
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.publicKey, validated.publicKey));
	if (server.length === 0) {
		debug("DISCOVER – server not found");
		return NextResponse.json({ error: "Server not found" }, { status: 404 });
	}

	try {
		assertSafeUrl(server[0].url);
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
		assertSafeUrl(validated.url);
	} catch (err) {
		debug("REGISTER – URL failed SSRF check: %s", validated.url);
		if (err instanceof UrlGuardError) {
			return NextResponse.json({ error: err.message }, { status: 400 });
		}
		throw err;
	}

	debug("REGISTER – fetching /discover from %s to validate server", validated.url);
	let response: { publicKey?: string };
	try {
		response = await (await fetch(validated.url + "/discover")).json();
	} catch (err) {
		debug("REGISTER – fetch to %s failed: %o", validated.url, err);
		return NextResponse.json({ error: "Failed to reach the server" }, { status: 502 });
	}

	if (!response.publicKey) {
		debug("REGISTER – remote server returned no public key");
		return NextResponse.json({ error: "Invalid server" }, { status: 400 });
	} else if (response.publicKey !== validated.publicKey) {
		debug("REGISTER – public key mismatch: provided vs fetched");
		debug("REGISTER – provided public key: %s", validated.publicKey);
		debug("REGISTER – fetched public key: %s", response.publicKey);
		return NextResponse.json({ error: "Invalid public key" }, { status: 400 });
	}

	debug("REGISTER – checking for existing registration at %s", validated.url);
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.url, validated.url.toString()));
	if (server.length > 0 && server[0].publicKey !== validated.publicKey) {
		debug("REGISTER – key mismatch against existing registration");
		return NextResponse.json({ error: "Your public key does not match the one registered on the server, to update your public key, please send a PATCH request instead." }, { status: 400 });
	}

	debug("REGISTER – upserting server %s", validated.url);
	await upsertServer(validated.url.toString(), validated.publicKey);

	debug("REGISTER – server registered successfully");
	return NextResponse.json({
		message: "Server registered successfully", echo: {
			url: process.env.NEXT_PUBLIC_APP_URL,
			publicKey: process.env.FEDERATION_PUBLIC_KEY,
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