/**
 * Key rotation: /discover/rotate/init and /discover/rotate/confirm.
 *
 * Security note: confirm intentionally does **not** auto-blacklist the rotating
 * server after failed proofs (that would let anyone spam-init for a victim URL and ban them).
 */
import db from "@/lib/db";
import { rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import type { EncryptedEnvelope } from "@/lib/federation/keytools";
import { decryptPayload, encryptPayload, signMessage } from "@/lib/federation/keytools";
import { expect, test } from "@playwright/test";
import createDebug from "debug";
import { eq } from "drizzle-orm";
import {
	clearTables,
	generateEnvKeyPair,
	getBlacklistedServer,
	getChallengesByServerUrl,
	getServerByUrl,
	seedBlacklist,
	seedChallenge,
	seedServer,
} from "../helpers/db";

const debug = createDebug("test:key-rotation");

const SERVER_URL = "https://test-server.com";

test.beforeEach(async ({ }, testInfo) => {
	debug("beforeEach – clearing tables for: %s", testInfo.title);
	await clearTables();
});
test.afterEach(async ({ }, testInfo) => {
	debug("afterEach – clearing tables after: %s", testInfo.title);
	await clearTables();
});

function getOwnEncryptionPublicKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!, "base64"));
}

function buildBadEnvelope() {
	return encryptPayload(
		JSON.stringify({
			signingOldSignature: "wrong",
			signingNewSignature: "wrong",
			encryptionOldPlaintext: "wrong",
			encryptionNewPlaintext: "wrong",
		}),
		getOwnEncryptionPublicKey(),
	);
}

interface InitChallenges {
	signingOldChallenge: string;
	signingNewChallenge: string;
	encryptionOldChallenge: EncryptedEnvelope;
	encryptionNewChallenge: EncryptedEnvelope;
}

function solveInitChallenges(
	challenges: InitChallenges,
	oldKeys: ReturnType<typeof generateEnvKeyPair>,
	newKeys: ReturnType<typeof generateEnvKeyPair>,
) {
	const oldSigningSecret = new Uint8Array(Buffer.from(oldKeys.signingSecretKey, "base64"));
	const newSigningSecret = new Uint8Array(Buffer.from(newKeys.signingSecretKey, "base64"));
	const oldEncSecret = new Uint8Array(Buffer.from(oldKeys.encryptionSecretKey, "base64"));
	const newEncSecret = new Uint8Array(Buffer.from(newKeys.encryptionSecretKey, "base64"));

	return {
		signingOldSignature: signMessage(challenges.signingOldChallenge, oldSigningSecret),
		signingNewSignature: signMessage(challenges.signingNewChallenge, newSigningSecret),
		encryptionOldPlaintext: decryptPayload(challenges.encryptionOldChallenge, oldEncSecret),
		encryptionNewPlaintext: decryptPayload(challenges.encryptionNewChallenge, newEncSecret),
	};
}

test("init rejects invalid JSON", async ({ request }) => {
	const res = await request.post("/discover/rotate/init", {
		headers: { "Content-Type": "application/json" },
		data: "{",
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_JSON" });
});

test("init rejects malformed body", async ({ request }) => {
	const res = await request.post("/discover/rotate/init", {
		data: {
			url: "not-a-url",
			newSigningPublicKey: "AA",
			newEncryptionPublicKey: "BB",
		},
	});
	expect(res.status()).toBe(400);
});

test("init rejects unregistered server", async ({ request }) => {
	const newKeys = generateEnvKeyPair();
	const res = await request.post("/discover/rotate/init", {
		data: {
			url: "https://unknown-server.com",
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(res.status()).toBe(404);
});

test("init rejects when server URL is blacklisted", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedBlacklist(SERVER_URL);
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const res = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(res.status()).toBe(403);
	expect(await res.json()).toMatchObject({ error: /blacklisted/i });
});

test("init returns 429 after too many inits for same server URL (cleared challenges between)", async ({
	request,
}) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const payload = {
		url: SERVER_URL,
		newSigningPublicKey: newKeys.signingPublicKey,
		newEncryptionPublicKey: newKeys.encryptionPublicKey,
	};

	const r1 = await request.post("/discover/rotate/init", { data: payload });
	expect(r1.status()).toBe(200);

	await db.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.serverUrl, SERVER_URL));

	const r2 = await request.post("/discover/rotate/init", { data: payload });
	expect(r2.status()).toBe(200);

	await db.delete(rotateChallengeTokens).where(eq(rotateChallengeTokens.serverUrl, SERVER_URL));

	const r3 = await request.post("/discover/rotate/init", { data: payload });
	expect(r3.status()).toBe(429);
	expect(await r3.json()).toMatchObject({ error: /Too many rotation init attempts/i });
});

test("init rejects same keys as currently registered", async ({ request }) => {
	const keys = generateEnvKeyPair();
	await seedServer(SERVER_URL, keys.signingPublicKey, keys.encryptionPublicKey);
	const res = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: keys.signingPublicKey,
			newEncryptionPublicKey: keys.encryptionPublicKey,
		},
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ error: /already registered/i });
});

test("init issues 4 challenges", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const res = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(res.status()).toBe(200);

	const body = await res.json();
	expect(body.signingOldChallenge).toBeDefined();
	expect(body.signingNewChallenge).toBeDefined();
	expect(body.encryptionOldChallenge).toBeDefined();
	expect(body.encryptionOldChallenge.ephemeralPublicKey).toBeDefined();
	expect(body.encryptionNewChallenge).toBeDefined();
	expect(body.encryptionNewChallenge.ephemeralPublicKey).toBeDefined();
});

test("init rejects duplicate while challenge is pending", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys1 = generateEnvKeyPair();
	const newKeys2 = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const res1 = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys1.signingPublicKey,
			newEncryptionPublicKey: newKeys1.encryptionPublicKey,
		},
	});
	expect(res1.status()).toBe(200);

	const res2 = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys2.signingPublicKey,
			newEncryptionPublicKey: newKeys2.encryptionPublicKey,
		},
	});
	expect(res2.status()).toBe(409);
	expect(await res2.json()).toMatchObject({ error: /already pending/i });
});

test("confirm rejects invalid JSON", async ({ request }) => {
	const res = await request.post("/discover/rotate/confirm", {
		headers: { "Content-Type": "application/json" },
		data: "{",
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ code: "INVALID_JSON" });
});

test("confirm rejects missing challenge", async ({ request }) => {
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://ghost-server.com",
			envelope: buildBadEnvelope(),
		},
	});
	expect(res.status()).toBe(404);
});

test("confirm rejects malformed envelope shape without touching attempts counter", async ({
	request,
}) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(initRes.status()).toBe(200);

	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: {
				ephemeralPublicKey: "AA",
				iv: "AA",
				ciphertext: "AA",
			},
		},
	});
	expect(res.status()).toBe(400);

	const rows = await getChallengesByServerUrl(SERVER_URL);
	expect(rows).toHaveLength(1);
	expect(rows[0].attemptsLeft).toBe(3);
});

test("confirm rejects expired challenge", async ({ request }) => {
	await seedChallenge({ expiresAt: new Date(Date.now() - 1000) });
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		},
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toMatchObject({ error: /expired/ });
});

test("confirm rejects wrong proofs (init → confirm)", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(initRes.status()).toBe(200);

	const confirmRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		},
	});
	expect(confirmRes.status()).toBe(400);
	expect(await confirmRes.json()).toMatchObject({ error: /verification failed|attempt\(s\) left/i });
});

test("confirm cancels challenge after attempts exhausted (does NOT blacklist)", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(initRes.status()).toBe(200);

	for (let i = 0; i < 3; i++) {
		const res = await request.post("/discover/rotate/confirm", {
			data: {
				serverUrl: SERVER_URL,
				envelope: buildBadEnvelope(),
			},
		});
		expect(res.status()).toBe(400);
		expect(await res.json()).toMatchObject({ error: /decrypt envelope|verification failed|attempt\(s\) left/i });
	}

	const finalRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		},
	});
	expect(finalRes.status()).toBe(403);
	expect(await finalRes.json()).toMatchObject({ error: /cancelled/i });

	expect(await getBlacklistedServer(SERVER_URL)).toBeUndefined();
	expect(await getChallengesByServerUrl(SERVER_URL)).toHaveLength(0);
});

test("confirm returns 404 when registry row removed after init", async ({ request }) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(initRes.status()).toBe(200);

	await db.delete(serverRegistry).where(eq(serverRegistry.url, SERVER_URL));

	const confirmRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		},
	});
	expect(confirmRes.status()).toBe(404);
	expect(await confirmRes.json()).toMatchObject({ error: /not found in registry/i });
});

test("full rotation flow: init → solve → confirm rotates both keys and clears challenge", async ({
	request,
}) => {
	const oldKeys = generateEnvKeyPair();
	const newKeys = generateEnvKeyPair();
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey);

	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		},
	});
	expect(initRes.status()).toBe(200);
	const challenges: InitChallenges = await initRes.json();

	const proofs = solveInitChallenges(challenges, oldKeys, newKeys);
	const envelope = encryptPayload(JSON.stringify(proofs), getOwnEncryptionPublicKey());

	const confirmRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope,
		},
	});
	expect(confirmRes.status()).toBe(200);
	expect(await confirmRes.json()).toMatchObject({ message: /confirmed/i });

	const server = await getServerByUrl(SERVER_URL);
	expect(server).toBeDefined();
	expect(server!.publicKey).toBe(newKeys.signingPublicKey);
	expect(server!.encryptionPublicKey).toBe(newKeys.encryptionPublicKey);

	expect(await getChallengesByServerUrl(SERVER_URL)).toHaveLength(0);
});
