/**
 * Tests the key rotation flow.
 * 
 * This test covers:
 * - Missing challenge
 * - Expired challenge
 * - Wrong challenge plaintext
 * - Blacklists server after too many failed attempts
 * - Confirms valid challenge and rotates key
 */
import { expect, test } from "@playwright/test"
import createDebug from "debug"
import forge from "node-forge"
import { clearTables, generateKeypair, seedChallenge, seedServer } from "./helpers/db"

const debug = createDebug("test:key")

test.beforeEach(async ({ }, testInfo) => {
	debug("beforeEach – clearing tables for: %s", testInfo.title)
	await clearTables()
})
test.afterEach(async ({ }, testInfo) => {
	debug("afterEach – clearing tables after: %s", testInfo.title)
	await clearTables()
})

function encryptPayload(payload: string, recipientPublicKey: string) {
	const pub = forge.pki.publicKeyFromPem(recipientPublicKey);
	return forge.util.encode64(
		pub.encrypt(
			forge.util.encodeUtf8(payload),
			"RSA-OAEP"
		)
	)
}

test("rejects missing challenge", async ({ request }) => {
	debug("test: rejects missing challenge – posting with unknown serverUrl")
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://ghost-server.com",
			signedOldChallenge: "fake",
			signedNewChallenge: "fake",
		}
	})
	debug("test: rejects missing challenge – status %d", res.status())
	expect(res.status()).toBe(404)
})

test("rejects expired challenge", async ({ request }) => {
	debug("test: rejects expired challenge – seeding expired challenge")
	await seedChallenge({ expiresAt: new Date(Date.now() - 1000) })
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://test-server.com",
			signedOldChallenge: "fake",
			signedNewChallenge: "fake",
		}
	})
	debug("test: rejects expired challenge – status %d", res.status())
	expect(res.status()).toBe(400)
	expect(await res.json()).toMatchObject({ error: /expired/ })
})

test("rejects wrong challenge plaintext", async ({ request }) => {
	debug("test: rejects wrong challenge plaintext – seeding valid challenge")
	await seedChallenge()
	debug("test: rejects wrong challenge plaintext – posting with incorrect plaintexts")
	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://test-server.com",
			// encrypt wrong plaintexts with your server's public key
			signedOldChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
			signedNewChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
		}
	})
	debug("test: rejects wrong challenge plaintext – status %d", res.status())
	expect(res.status()).toBe(400)
	expect(await res.json()).toMatchObject({ error: /mismatch/ })
})

test("blacklists server after too many failed attempts", async ({ request }) => {
	debug("test: blacklists server after too many failed attempts – seeding server and challenge (attemptsLeft=3)")
	await seedServer("https://test-server.com", process.env.FEDERATION_PUBLIC_KEY!)
	await seedChallenge({ expiresAt: new Date(Date.now() + 1000 * 60) })

	// 3 wrong attempts exhaust attemptsLeft (3 → 0), each returning 400 mismatch
	for (let i = 0; i < 3; i++) {
		debug("test: blacklists server after too many failed attempts – wrong attempt %d/3", i + 1)
		const res = await request.post("/discover/rotate/confirm", {
			data: {
				serverUrl: "https://test-server.com",
				signedOldChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
				signedNewChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
			}
		})
		debug("test: blacklists server after too many failed attempts – status %d", res.status())
		expect(res.status()).toBe(400)
		expect(await res.json()).toMatchObject({ error: /mismatch/ })
	}

	// 4th attempt: attemptsLeft is now 0, server gets blacklisted
	debug("test: blacklists server after too many failed attempts – 4th attempt should trigger blacklist (403)")
	const finalRes = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://test-server.com",
			signedOldChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
			signedNewChallenge: encryptPayload("wrong", process.env.FEDERATION_PUBLIC_KEY!),
		}
	})
	debug("test: blacklists server after too many failed attempts – final status %d", finalRes.status())
	expect(finalRes.status()).toBe(403)
	expect(await finalRes.json()).toMatchObject({ error: /blacklisted/ })
})

test("confirms valid challenge and rotates key", async ({ request }) => {
	debug("test: confirms valid challenge – generating old and new keypairs")
	// SB's old keypair — what is currently registered
	const { publicKey: oldPublicKey } = generateKeypair()
	// SB's new keypair — what SB wants to rotate to
	const { publicKey: newPublicKey } = generateKeypair()

	debug("test: confirms valid challenge – seeding server and challenge")
	await seedServer("https://test-server.com", oldPublicKey)
	const challenge = await seedChallenge({ newPublicKey })

	// Simulate SB: re-encrypt the plaintext tokens with SA's public key
	debug("test: confirms valid challenge – re-encrypting tokens with SA public key")
	const signedOldChallenge = encryptPayload(challenge.oldKeyToken, process.env.FEDERATION_PUBLIC_KEY!)
	const signedNewChallenge = encryptPayload(challenge.newKeyToken, process.env.FEDERATION_PUBLIC_KEY!)

	const res = await request.post("/discover/rotate/confirm", {
		data: {
			serverUrl: "https://test-server.com",
			signedOldChallenge,
			signedNewChallenge,
		}
	})
	debug("test: confirms valid challenge – status %d", res.status())
	expect(res.status()).toBe(200)
	expect(await res.json()).toMatchObject({ message: /confirmed/ })
})