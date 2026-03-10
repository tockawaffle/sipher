// tests/helpers/db.ts
import db from "@/lib/db";
import { rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import forge from "node-forge";

export function generateKeypair() {
	const keypair = forge.pki.rsa.generateKeyPair(2048);
	return {
		publicKey: forge.pki.publicKeyToPem(keypair.publicKey),
		privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
	}
}

export async function seedServer(url: string, publicKey: string) {
	await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url,
		publicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
	}).onConflictDoNothing()
}

export async function seedChallenge(overrides?: Partial<typeof rotateChallengeTokens.$inferInsert>) {
	const { publicKey: defaultNewPublicKey } = generateKeypair()
	const defaults = {
		id: crypto.randomUUID(),
		serverUrl: "https://test-server.com",
		oldKeyToken: crypto.randomUUID(),
		newKeyToken: crypto.randomUUID(),
		newPublicKey: defaultNewPublicKey,
		attemptsLeft: 3,
		createdAt: new Date(),
		expiresAt: new Date(Date.now() + 1000 * 60 * 5),
	}
	const row = { ...defaults, ...overrides }
	await db.insert(rotateChallengeTokens).values(row)
	return row
}

export async function clearTables() {
	await db.delete(rotateChallengeTokens)
	await db.delete(serverRegistry)
}