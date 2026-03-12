/**
 * Tests the key rotation flow.
 * 
 * This test covers:
 * - Init endpoint: validation, not-found, duplicate challenge
 * - Missing challenge on confirm
 * - Expired challenge on confirm
 * - Wrong challenge proofs (full init → confirm flow)
 * - Blacklists server after too many failed attempts
 * - Full init → confirm happy path that rotates both keys
 */
import { expect, test } from "@playwright/test"
import createDebug from "debug"
import type { EncryptedEnvelope } from "@/lib/federation/keytools"
import { decryptPayload, encryptPayload, signMessage } from "@/lib/federation/keytools"
import { clearTables, generateKeypair, getServerByUrl, seedChallenge, seedServer } from "./helpers/db"

const debug = createDebug("test:key")

const SERVER_URL = "https://test-server.com"

test.beforeEach(async ({ }, testInfo) => {
	debug("beforeEach – clearing tables for: %s", testInfo.title)
	await clearTables()
})
test.afterEach(async ({ }, testInfo) => {
	debug("afterEach – clearing tables after: %s", testInfo.title)
	await clearTables()
})

function getOwnEncryptionPublicKey(): Uint8Array {
	return new Uint8Array(Buffer.from(process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!, "base64"))
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
	)
}

interface InitChallenges {
	signingOldChallenge: string
	signingNewChallenge: string
	encryptionOldChallenge: EncryptedEnvelope
	encryptionNewChallenge: EncryptedEnvelope
}

function solveInitChallenges(
	challenges: InitChallenges,
	oldKeys: ReturnType<typeof generateKeypair>,
	newKeys: ReturnType<typeof generateKeypair>,
) {
	const oldSigningSecret = new Uint8Array(Buffer.from(oldKeys.signingSecretKey, "base64"))
	const newSigningSecret = new Uint8Array(Buffer.from(newKeys.signingSecretKey, "base64"))
	const oldEncSecret = new Uint8Array(Buffer.from(oldKeys.encryptionSecretKey, "base64"))
	const newEncSecret = new Uint8Array(Buffer.from(newKeys.encryptionSecretKey, "base64"))

	return {
		signingOldSignature: signMessage(challenges.signingOldChallenge, oldSigningSecret),
		signingNewSignature: signMessage(challenges.signingNewChallenge, newSigningSecret),
		encryptionOldPlaintext: decryptPayload(challenges.encryptionOldChallenge, oldEncSecret),
		encryptionNewPlaintext: decryptPayload(challenges.encryptionNewChallenge, newEncSecret),
	}
}

// ---------------------------------------------------------------------------
// rotate/init tests
// ---------------------------------------------------------------------------
test("init rejects unregistered server", async ({ request }) => {
	const newKeys = generateKeypair()
	const res = await request.post("/discover/rotate/init", {
		data: {
			url: "https://unknown-server.com",
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		}
	})
	expect(res.status()).toBe(404)
})

test("init rejects same keys as currently registered", async ({ request }) => {
	const keys = generateKeypair()
	await seedServer(SERVER_URL, keys.signingPublicKey, keys.encryptionPublicKey)
	const res = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: keys.signingPublicKey,
			newEncryptionPublicKey: keys.encryptionPublicKey,
		}
	})
	expect(res.status()).toBe(400)
	expect(await res.json()).toMatchObject({ error: /already registered/i })
})

test("init issues 4 challenges", async ({ request }) => {
	const oldKeys = generateKeypair()
	const newKeys = generateKeypair()
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey)

	const res = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		}
	})
	expect(res.status()).toBe(200)

	const body = await res.json()
	expect(body.signingOldChallenge).toBeDefined()
	expect(body.signingNewChallenge).toBeDefined()
	expect(body.encryptionOldChallenge).toBeDefined()
	expect(body.encryptionOldChallenge.ephemeralPublicKey).toBeDefined()
	expect(body.encryptionNewChallenge).toBeDefined()
	expect(body.encryptionNewChallenge.ephemeralPublicKey).toBeDefined()
})

test("init rejects duplicate while challenge is pending", async ({ request }) => {
	const oldKeys = generateKeypair()
	const newKeys1 = generateKeypair()
	const newKeys2 = generateKeypair()
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey)

	const res1 = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys1.signingPublicKey,
			newEncryptionPublicKey: newKeys1.encryptionPublicKey,
		}
	})
	expect(res1.status()).toBe(200)

	const res2 = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys2.signingPublicKey,
			newEncryptionPublicKey: newKeys2.encryptionPublicKey,
		}
	})
	expect(res2.status()).toBe(409)
	expect(await res2.json()).toMatchObject({ error: /already pending/i })
})

// ---------------------------------------------------------------------------
// rotate/confirm tests
// ---------------------------------------------------------------------------
test("confirm rejects missing challenge", async ({ request }) => {
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://ghost-server.com",
			envelope: buildBadEnvelope(),
		}
	})
	expect(res.status()).toBe(404)
})

test("confirm rejects expired challenge", async ({ request }) => {
	await seedChallenge({ expiresAt: new Date(Date.now() - 1000) })
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		}
	})
	expect(res.status()).toBe(400)
	expect(await res.json()).toMatchObject({ error: /expired/ })
})

test("confirm rejects wrong proofs (init → confirm)", async ({ request }) => {
	const oldKeys = generateKeypair()
	const newKeys = generateKeypair()
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey)

	debug("test: wrong proofs – calling init")
	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		}
	})
	expect(initRes.status()).toBe(200)

	debug("test: wrong proofs – confirming with garbage proofs")
	const confirmRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		}
	})
	expect(confirmRes.status()).toBe(400)
	expect(await confirmRes.json()).toMatchObject({ error: /failed/i })
})

test("confirm blacklists after too many failed attempts", async ({ request }) => {
	const oldKeys = generateKeypair()
	const newKeys = generateKeypair()
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey)

	debug("test: blacklists – calling init")
	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		}
	})
	expect(initRes.status()).toBe(200)

	for (let i = 0; i < 3; i++) {
		debug("test: blacklists – wrong attempt %d/3", i + 1)
		const res = await request.post("/discover/rotate/confirm", {
			data: {
				serverUrl: SERVER_URL,
				envelope: buildBadEnvelope(),
			}
		})
		expect(res.status()).toBe(400)
		expect(await res.json()).toMatchObject({ error: /failed/i })
	}

	debug("test: blacklists – 4th attempt triggers blacklist")
	const finalRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope: buildBadEnvelope(),
		}
	})
	expect(finalRes.status()).toBe(403)
	expect(await finalRes.json()).toMatchObject({ error: /blacklisted/ })
})

// ---------------------------------------------------------------------------
// Full init → confirm happy path
// ---------------------------------------------------------------------------
test("full rotation flow: init → solve → confirm rotates both keys", async ({ request }) => {
	const oldKeys = generateKeypair()
	const newKeys = generateKeypair()
	await seedServer(SERVER_URL, oldKeys.signingPublicKey, oldKeys.encryptionPublicKey)

	debug("test: full flow – calling init")
	const initRes = await request.post("/discover/rotate/init", {
		data: {
			url: SERVER_URL,
			newSigningPublicKey: newKeys.signingPublicKey,
			newEncryptionPublicKey: newKeys.encryptionPublicKey,
		}
	})
	expect(initRes.status()).toBe(200)
	const challenges: InitChallenges = await initRes.json()

	debug("test: full flow – solving challenges")
	const proofs = solveInitChallenges(challenges, oldKeys, newKeys)

	debug("test: full flow – building proof envelope encrypted with SA's X25519 key")
	const envelope = encryptPayload(JSON.stringify(proofs), getOwnEncryptionPublicKey())

	debug("test: full flow – confirming")
	const confirmRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: SERVER_URL,
			envelope,
		}
	})
	expect(confirmRes.status()).toBe(200)
	expect(await confirmRes.json()).toMatchObject({ message: /confirmed/ })

	debug("test: full flow – verifying keys were rotated in DB")
	const server = await getServerByUrl(SERVER_URL)
	expect(server).toBeDefined()
	expect(server!.publicKey).toBe(newKeys.signingPublicKey)
	expect(server!.encryptionPublicKey).toBe(newKeys.encryptionPublicKey)
})
