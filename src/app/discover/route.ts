import db from "@/lib/db";
import { serverRegistry } from "@/lib/db/schema";
import { decryptPayload } from "@/lib/federation/keytools";
import createDebug from "debug";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import forge from "node-forge";
import { z } from "zod";

const debug = createDebug("app:discover");

export async function GET() {
	debug("GET /discover – fetching healthy peers");
	const peers = await db.select().from(serverRegistry).where(eq(serverRegistry.isHealthy, true));
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

const schema = z.discriminatedUnion("method", [
	z.object({
		method: z.literal("DISCOVER"),
		publicKey: publicKeySchema,
		signature: z.string().refine((signature) => {
			try {
				const sig = decryptPayload(signature, process.env.FEDERATION_PRIVATE_KEY!);
				const data = JSON.parse(sig);
				return data.publicKey != null && data.url != null;
			} catch {
				return false;
			}
		}, { message: "Invalid signature" }),
	}),
	z.object({
		method: z.literal("REGISTER"),
		url: z.url(),
		publicKey: publicKeySchema,
	})
]);

async function discoverServer(validated: Extract<z.infer<typeof schema>, { method: "DISCOVER" }>) {
	debug("DISCOVER – looking up server by public key");
	const server = await db.select().from(serverRegistry).where(eq(serverRegistry.publicKey, validated.publicKey));
	if (server.length === 0) {
		debug("DISCOVER – server not found");
		return NextResponse.json({ error: "Server not found" }, { status: 404 });
	}

	const confirmations = {
		sameKeyOnServer: false,
		sameKeyOnFetch: false,
	}

	if (server[0].publicKey === validated.publicKey) confirmations.sameKeyOnServer = true;
	debug("DISCOVER – fetching public key from federation server %s", server[0].url);
	const federationResponse = await (await fetch(server[0].url + "/discover")).json();
	if (federationResponse.publicKey === validated.publicKey) confirmations.sameKeyOnFetch = true;

	debug("DISCOVER – confirmations: %o", confirmations);
	return NextResponse.json(confirmations);
}

async function registerServer(validated: Extract<z.infer<typeof schema>, { method: "REGISTER" }>) {
	debug("REGISTER – fetching /discover from %s to validate server", validated.url);
	const response = await (await fetch(validated.url + "/discover")).json();
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

	const validated = schema.safeParse(body);

	if (!validated.success) {
		debug("POST /discover – validation failed: %o", validated.error.message);
		return NextResponse.json({ error: validated.error.message }, { status: 400 });
	}

	switch (validated.data.method) {
		case "DISCOVER":
			return await discoverServer(validated.data);
		case "REGISTER":
			return await registerServer(validated.data);
		default:
			return NextResponse.json({ error: "Invalid method" }, { status: 400 });
	}
}