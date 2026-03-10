// tests/helpers/db.ts
import db from "@/lib/db";
import { rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

export async function getServerByUrl(url: string) {
	return (await db.select().from(serverRegistry).where(eq(serverRegistry.url, url)))[0]
}

export async function clearServerRegistry() {
	return await db.delete(serverRegistry)
}

export async function clearRotateChallengeTokens() {
	return await db.delete(rotateChallengeTokens)
}

export async function insertServerEcho(url: string, publicKey: string) {
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

export async function clearTables() {
	return await Promise.all([
		clearRotateChallengeTokens(),
		clearServerRegistry(),
	])
}