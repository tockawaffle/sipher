/**
 * /proxy — PROXY relay bookkeeping + TARGETED decryption / validation / FEDERATE_FOLLOW handling.
 */
import db from "@/lib/db";
import { follows, serverRegistry, user } from "@/lib/db/schema";
import { posts, remoteIdentityKeys } from "@/lib/db/schema";
import {
	binary_to_base58,
	decryptPayload,
	encryptPayload,
	signMessage,
	verifySignature,
} from "@/lib/federation/keytools";
import { canonicalPostBytes } from "@/lib/identity/postSignature";
import getRedisClient from "@/lib/redis";
import nacl from "tweetnacl";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
	clearTables,
	generateEnvKeyPair,
	seedBlacklist,
	seedServer,
} from "../helpers/db";
import { seedMinimalUser } from "../helpers/identity";

test.describe.configure({ mode: "serial" });

const SENDER_URL = "https://proxy-remote-peer.test";
const senderKeys = generateEnvKeyPair();

function origin(): string {
	return process.env.BETTER_AUTH_URL!.replace(/\/$/, "");
}

function recipientEncryptionPublicKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!, "base64"));
}

async function resetRegistryAndSender() {
	await db.delete(follows);
	await db.delete(posts);
	await db.delete(remoteIdentityKeys);
	await clearTables();
	// The 429 test fills this origin's /proxy budget; later tests need it back.
	await getRedisClient().del(`rl:proxy:${SENDER_URL}`);
	await seedServer(SENDER_URL, senderKeys.signingPublicKey, senderKeys.encryptionPublicKey);
}

test.beforeEach(async () => {
	await resetRegistryAndSender();
});

/** Builds TARGETED outer envelope + JSON POST body for /proxy. */
function buildFollowTargetedEnvelope(followerId: string, followingId: string, sigTamper?: string, sentAt = new Date()) {
	const innerFollow = {
		federationUrl: SENDER_URL,
		method: "FEDERATE" as const,
		sentAt: sentAt.toISOString(),
		following: {
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			followerId,
			followingId,
			accepted: false,
			followerServerUrl: SENDER_URL as string | null,
		},
	};
	const innerRaw = JSON.stringify(innerFollow);
	const senderSigningSecret = new Uint8Array(Buffer.from(senderKeys.signingSecretKey, "base64"));
	const followSig = sigTamper ?? signMessage(innerRaw, senderSigningSecret);
	const followEnv = encryptPayload(innerRaw, recipientEncryptionPublicKey());
	const fedOuterStr = JSON.stringify({
		method: "FEDERATE",
		payload: followEnv,
		signature: followSig,
	});
	const targetApi = `${origin()}/api/auth/social/follows`;
	const wire = JSON.stringify({
		targetUrl: targetApi,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": SENDER_URL,
			"X-Federation-Target": targetApi,
			"Origin": SENDER_URL,
		},
		body: fedOuterStr,
	});
	const outerEnv = encryptPayload(wire, recipientEncryptionPublicKey());
	return outerEnv;
}

test("missing X-Federation-Origin returns 400", async ({ request }) => {
	const res = await request.post("/proxy", {
		data: { method: "TARGETED", payload: buildFollowTargetedEnvelope("a", "b") },
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "MISSING_FED_ORIGIN_HEADER" });
});

test("invalid JSON body returns INVALID_PROXY_DATA", async ({ request }) => {
	const res = await request.post("/proxy", {
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": SENDER_URL,
		},
		data: "{",
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_PROXY_DATA" });
});

test("PROXY schema rejects targetUrl without /proxy path", async ({ request }) => {
	const env = encryptPayload("{}", recipientEncryptionPublicKey());
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: {
			method: "PROXY",
			targetUrl: "https://example.com/not-proxy",
			publicSigningKey: senderKeys.signingPublicKey,
			publicEncryptionKey: senderKeys.encryptionPublicKey,
			payload: env,
		},
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_PROXY_DATA" });
});

test("PROXY rejects missing public keys", async ({ request }) => {
	const env = encryptPayload("{}", recipientEncryptionPublicKey());
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: {
			method: "PROXY",
			targetUrl: `${origin()}/proxy`,
			payload: env,
		},
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_PROXY_DATA" });
});

test("PROXY rejects unknown sender", async ({ request }) => {
	await db.delete(serverRegistry).where(eq(serverRegistry.url, SENDER_URL));

	const env = encryptPayload("{}", recipientEncryptionPublicKey());
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": "https://totally-unknown-peer.example" },
		data: {
			method: "PROXY",
			targetUrl: `${origin()}/proxy`,
			publicSigningKey: senderKeys.signingPublicKey,
			publicEncryptionKey: senderKeys.encryptionPublicKey,
			payload: env,
		},
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "UNKNOWN_FEDERATION_SERVER_INTERACTION" });
});

test("PROXY rejects signing public key mismatch", async ({ request }) => {
	const fake = generateEnvKeyPair();
	const env = encryptPayload("{}", recipientEncryptionPublicKey());
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: {
			method: "PROXY",
			targetUrl: `${origin()}/proxy`,
			publicSigningKey: fake.signingPublicKey,
			publicEncryptionKey: senderKeys.encryptionPublicKey,
			payload: env,
		},
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "INCORRECT_KEYS" });
});

test("PROXY rejects encryption public key mismatch", async ({ request }) => {
	const fake = generateEnvKeyPair();
	const env = encryptPayload("{}", recipientEncryptionPublicKey());
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: {
			method: "PROXY",
			targetUrl: `${origin()}/proxy`,
			publicSigningKey: senderKeys.signingPublicKey,
			publicEncryptionKey: fake.encryptionPublicKey,
			payload: env,
		},
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "INCORRECT_KEYS" });
});

test("TARGETED decrypt failure returns DECRYPT_FAILED", async ({ request }) => {
	const stranger = generateEnvKeyPair();
	const garbageWire = encryptPayload(JSON.stringify({ hello: "world" }), new Uint8Array(Buffer.from(stranger.encryptionPublicKey, "base64")));

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: garbageWire },
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "DECRYPT_FAILED" });
});

test("TARGETED rejects X-Federation-Target origin mismatch", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();

	const innerFollow = {
		federationUrl: SENDER_URL,
		method: "FEDERATE" as const,
		sentAt: new Date().toISOString(),
		following: {
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			followerId,
			followingId,
			accepted: false,
			followerServerUrl: SENDER_URL,
		},
	};
	const innerRaw = JSON.stringify(innerFollow);
	const followSig = signMessage(innerRaw, new Uint8Array(Buffer.from(senderKeys.signingSecretKey, "base64")));
	const followEnv = encryptPayload(innerRaw, recipientEncryptionPublicKey());
	const fedOuterStr = JSON.stringify({
		method: "FEDERATE",
		payload: followEnv,
		signature: followSig,
	});
	const targetApi = `${origin()}/api/auth/social/follows`;
	const wire = JSON.stringify({
		targetUrl: targetApi,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": SENDER_URL,
			"X-Federation-Target": "https://evil.example/api/auth/social/follows",
			"Origin": SENDER_URL,
		},
		body: fedOuterStr,
	});
	const outerEnv = encryptPayload(wire, recipientEncryptionPublicKey());

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv },
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_TARGETED_DATA" });
});

test("TARGETED rejects unknown federation sender in decrypted headers", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();

	const innerFollow = {
		federationUrl: "https://no-registry-entry.example",
		method: "FEDERATE" as const,
		sentAt: new Date().toISOString(),
		following: {
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			followerId,
			followingId,
			accepted: false,
			followerServerUrl: "https://no-registry-entry.example",
		},
	};
	const innerRaw = JSON.stringify(innerFollow);
	const fk = generateEnvKeyPair();
	const followSig = signMessage(innerRaw, new Uint8Array(Buffer.from(fk.signingSecretKey, "base64")));
	const followEnv = encryptPayload(innerRaw, recipientEncryptionPublicKey());
	const fedOuterStr = JSON.stringify({
		method: "FEDERATE",
		payload: followEnv,
		signature: followSig,
	});
	const targetApi = `${origin()}/api/auth/social/follows`;
	const wire = JSON.stringify({
		targetUrl: targetApi,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": "https://no-registry-entry.example",
			"X-Federation-Target": targetApi,
			"Origin": "https://no-registry-entry.example",
		},
		body: fedOuterStr,
	});
	const outerEnv = encryptPayload(wire, recipientEncryptionPublicKey());

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv },
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "UNKNOWN_FEDERATION_SERVER_INTERACTION" });
});

test("TARGETED rejects blacklisted sender", async ({ request }) => {
	await seedBlacklist(SENDER_URL);

	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({
		id: followerId,
		email: `${followerId}@proxy-test.invalid`,
	});
	await seedMinimalUser({
		id: followingId,
		email: `${followingId}@proxy-test.invalid`,
	});

	const outerEnv = buildFollowTargetedEnvelope(followerId, followingId);

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv },
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "BLACKLISTED_FEDERATION_SERVER" });

	await db.delete(user).where(eq(user.id, followerId));
	await db.delete(user).where(eq(user.id, followingId));
});

test("TARGETED rejects invalid follow signature", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({
		id: followerId,
		email: `${followerId}@proxy-test.invalid`,
	});
	await seedMinimalUser({
		id: followingId,
		email: `${followingId}@proxy-test.invalid`,
	});

	const bogusSig = Buffer.alloc(64, 7).toString("base64");
	const outerEnv = buildFollowTargetedEnvelope(followerId, followingId, bogusSig);

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv },
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ code: "INVALID_SIGNATURE" });
});

test("TARGETED FEDERATE_FOLLOW rejects a replay older than the freshness window", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({ id: followerId, email: `${followerId}@proxy-test.invalid` });
	await seedMinimalUser({ id: followingId, email: `${followingId}@proxy-test.invalid`, isPrivate: false });

	// Correctly signed and encrypted, but captured an hour ago.
	const stale = new Date(Date.now() - 60 * 60 * 1000);
	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: buildFollowTargetedEnvelope(followerId, followingId, undefined, stale) },
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_FOLLOW_PAYLOAD" });
});

test("TARGETED FEDERATE_FOLLOW inserts follow and returns PROXY_RESPONSE", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({
		id: followerId,
		email: `${followerId}@proxy-test.invalid`,
	});
	await seedMinimalUser({
		id: followingId,
		email: `${followingId}@proxy-test.invalid`,
		isPrivate: false,
	});

	const outerEnv = buildFollowTargetedEnvelope(followerId, followingId);

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv },
	});
	expect(res.status()).toBe(200);
	const body = await res.json();
	expect(body.method).toBe("PROXY_RESPONSE");
	expect(body.status).toBe("acknowledged");
	expect(body.signature).toBeDefined();
	expect(body.data).toBeDefined();

	const ackPlain = decryptPayload(body.data, new Uint8Array(Buffer.from(senderKeys.encryptionSecretKey, "base64")));
	expect(
		verifySignature(
			ackPlain,
			body.signature,
			new Uint8Array(Buffer.from(process.env.FEDERATION_PUBLIC_KEY!, "base64")),
		),
	).toBe(true);
	// The sender parses the ack with FollowEnvelopeSchema, which requires a fresh sentAt.
	expect(Date.now() - Date.parse(JSON.parse(ackPlain).sentAt)).toBeLessThan(60_000);

	const innerAck = JSON.parse(ackPlain) as {
		following: { followerId: string; followingId: string };
	};
	expect(innerAck.following.followerId).toBe(followerId);
	expect(innerAck.following.followingId).toBe(followingId);
});

test("TARGETED duplicate FEDERATE_FOLLOW returns 409", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({
		id: followerId,
		email: `${followerId}@proxy-test.invalid`,
	});
	await seedMinimalUser({
		id: followingId,
		email: `${followingId}@proxy-test.invalid`,
	});

	const outerEnv1 = buildFollowTargetedEnvelope(followerId, followingId);
	const r1 = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv1 },
	});
	expect(r1.status()).toBe(200);

	const outerEnv2 = buildFollowTargetedEnvelope(followerId, followingId);
	const r2 = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: outerEnv2 },
	});
	expect(r2.status()).toBe(409);
	expect(await r2.json()).toMatchObject({ code: "FOLLOW_ALREADY_EXISTS" });
});

test("TARGETED FEDERATE_FOLLOW is not a duplicate of the same ids from another server", async ({ request }) => {
	const followerId = crypto.randomUUID();
	const followingId = crypto.randomUUID();
	await seedMinimalUser({ id: followingId, email: `${followingId}@proxy-test.invalid` });

	// User ids are only unique per server: another peer already has a user with this id following ours.
	const otherServer = "https://other-peer.test";
	const otherKeys = generateEnvKeyPair();
	await seedServer(otherServer, otherKeys.signingPublicKey, otherKeys.encryptionPublicKey);
	await db.insert(follows).values({
		id: crypto.randomUUID(),
		followerId,
		followingId,
		accepted: true,
		createdAt: new Date(),
		followerServerUrl: otherServer,
	});

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: buildFollowTargetedEnvelope(followerId, followingId) },
	});
	expect(res.status()).toBe(200);
	expect(await db.select().from(follows).where(eq(follows.followingId, followingId))).toHaveLength(2);
});

test("rate limits proxy requests per X-Federation-Origin (429)", async ({ request }) => {
	const stranger = generateEnvKeyPair();
	let saw429 = false;
	for (let i = 0; i < 105; i++) {
		const garbageWire = encryptPayload(JSON.stringify({ n: i }), new Uint8Array(Buffer.from(stranger.encryptionPublicKey, "base64")));
		const res = await request.post("/proxy", {
			headers: { "X-Federation-Origin": SENDER_URL },
			data: { method: "TARGETED", payload: garbageWire },
		});
		if (res.status() === 429) {
			saw429 = true;
			const body = await res.json();
			expect(body.code).toBe("RATE_LIMITED");
			expect(res.headers()["retry-after"]).toBeDefined();
			break;
		}
		expect(res.status()).toBe(400);
		expect((await res.json()).code).toBe("DECRYPT_FAILED");
	}
	expect(saw429).toBe(true);
});

test("request larger than PROXY_MAX_BODY_BYTES returns 413", async ({ request }) => {
	// PROXY_MAX_BODY_BYTES is 256 KiB (262 144 bytes), so go one byte over it.
	const huge = "x".repeat(256 * 1024 + 1);
	const res = await request.post("/proxy", {
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": SENDER_URL,
		},
		data: huge,
	});
	expect(res.status()).toBe(413);
	expect(await res.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
});

// Full round-trip flow — decrypt → registered-sender check → nonce echo —
// against the real `/proxy` route on this server (no stubs involved).
test("TARGETED PING returns pong with the same nonce", async ({ request }) => {
	const nonce = crypto.randomUUID();
	const inner = JSON.stringify({ method: "PING", nonce });
	const env = encryptPayload(inner, recipientEncryptionPublicKey());

	const res = await request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload: env },
	});

	expect(res.status()).toBe(200);
	const body = await res.json();
	expect(body.method).toBe("PROXY_RESPONSE");
	expect(body.status).toBe("pong");
	expect(body.nonce).toBe(nonce);
});

// The end-to-end PROXY relay flow (A direct → B fails → A → C proxy → B → C → A)
// is verified by `tests/integration/proxy-chain.ts` against the dockerized 3-instance
// federation cluster. It can't be faithfully modelled with a stub here, because the
// failover decision lives inside `federationFetch` on the sender side and only
// triggers when the target is *genuinely* unreachable for the sender but reachable
// via a real proxy peer.

/**
 * Builds a TARGETED FEDERATE_POST from SENDER_URL, signed by `author`.
 * `signer` defaults to the author; pass another key pair to forge the signature.
 */
function buildPostTargetedEnvelope(
	authorId: string,
	author: nacl.SignKeyPair,
	opts: { signer?: nacl.SignKeyPair; federationUrl?: string } = {},
) {
	const federationUrl = opts.federationUrl ?? SENDER_URL;
	const post = {
		id: crypto.randomUUID(),
		content: [{ type: "text" as const, value: "hello from a remote author" }],
		authorId,
		published: new Date().toISOString(),
		isPrivate: false,
	};
	const authorSignature = Buffer.from(
		nacl.sign.detached(
			canonicalPostBytes({
				postId: post.id,
				authorId,
				publishedAt: post.published,
				content: post.content,
				federationUrl,
			}),
			(opts.signer ?? author).secretKey,
		),
	).toString("base64");
	const innerRaw = JSON.stringify({
		post: { ...post, authorSignature, authorSigningPublicKey: binary_to_base58(author.publicKey) },
		federationUrl,
		method: "FEDERATE_POST",
		sentAt: new Date().toISOString(),
	});
	const senderSigningSecret = new Uint8Array(Buffer.from(senderKeys.signingSecretKey, "base64"));
	const targetApi = `${origin()}/api/auth/social/posts`;
	const wire = JSON.stringify({
		targetUrl: targetApi,
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Federation-Origin": SENDER_URL,
			"X-Federation-Target": targetApi,
			"Origin": SENDER_URL,
		},
		body: JSON.stringify({
			method: "FEDERATE_POST",
			payload: encryptPayload(innerRaw, recipientEncryptionPublicKey()),
			signature: signMessage(innerRaw, senderSigningSecret),
		}),
	});
	return { outerEnv: encryptPayload(wire, recipientEncryptionPublicKey()), postId: post.id };
}

async function sendTargeted(request: import("@playwright/test").APIRequestContext, payload: unknown) {
	return request.post("/proxy", {
		headers: { "X-Federation-Origin": SENDER_URL },
		data: { method: "TARGETED", payload },
	});
}

test("TARGETED FEDERATE_POST stores the post and pins the author's key", async ({ request }) => {
	const authorId = crypto.randomUUID();
	const author = nacl.sign.keyPair();
	const { outerEnv, postId } = buildPostTargetedEnvelope(authorId, author);

	const res = await sendTargeted(request, outerEnv);
	expect(res.status()).toBe(200);

	const stored = await db.select().from(posts).where(eq(posts.federationPostId, postId));
	expect(stored).toHaveLength(1);
	const [pin] = await db.select().from(remoteIdentityKeys).where(eq(remoteIdentityKeys.remoteUserId, authorId));
	expect(pin.federationUrl).toBe(SENDER_URL);
	expect(pin.signingPublicKey).toBe(binary_to_base58(author.publicKey));
});

test("TARGETED FEDERATE_POST rejects a post the author did not sign", async ({ request }) => {
	const author = nacl.sign.keyPair();
	const { outerEnv, postId } = buildPostTargetedEnvelope(crypto.randomUUID(), author, {
		signer: nacl.sign.keyPair(),
	});

	const res = await sendTargeted(request, outerEnv);
	expect(res.status()).toBe(403);
	expect((await res.json()).code).toBe("INVALID_AUTHOR_SIGNATURE");
	expect(await db.select().from(posts).where(eq(posts.federationPostId, postId))).toHaveLength(0);
});

test("TARGETED FEDERATE_POST rejects a known author signing with a new key", async ({ request }) => {
	const authorId = crypto.randomUUID();
	const first = buildPostTargetedEnvelope(authorId, nacl.sign.keyPair());
	expect((await sendTargeted(request, first.outerEnv)).status()).toBe(200);

	// The sending server swaps in a key of its own and signs a post as the same author.
	const forged = buildPostTargetedEnvelope(authorId, nacl.sign.keyPair());
	const res = await sendTargeted(request, forged.outerEnv);
	expect(res.status()).toBe(409);
	expect((await res.json()).code).toBe("AUTHOR_KEY_MISMATCH");
	expect(await db.select().from(posts).where(eq(posts.federationPostId, forged.postId))).toHaveLength(0);
});

test("TARGETED FEDERATE_POST rejects a post claiming another server as its origin", async ({ request }) => {
	const { outerEnv } = buildPostTargetedEnvelope(crypto.randomUUID(), nacl.sign.keyPair(), {
		federationUrl: "https://someone-else.test",
	});

	const res = await sendTargeted(request, outerEnv);
	expect(res.status()).toBe(403);
	expect((await res.json()).code).toBe("FEDERATION_URL_MISMATCH");
});
