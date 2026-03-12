// tests/helpers/db.ts
import db from "@/lib/db";
import { blacklistedServers, rotateChallengeTokens, serverRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import nacl from "tweetnacl";

export function generateKeypair() {
	const signing = nacl.sign.keyPair();
	const encryption = nacl.box.keyPair();
	return {
		signingPublicKey: Buffer.from(signing.publicKey).toString("base64"),
		signingSecretKey: Buffer.from(signing.secretKey).toString("base64"),
		encryptionPublicKey: Buffer.from(encryption.publicKey).toString("base64"),
		encryptionSecretKey: Buffer.from(encryption.secretKey).toString("base64"),
	}
}

export async function seedServer(url: string, publicKey: string, encryptionPublicKey: string) {
	await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url,
		publicKey,
		encryptionPublicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
	}).onConflictDoNothing()
}

export async function seedChallenge(overrides?: Partial<typeof rotateChallengeTokens.$inferInsert>) {
	const keys = generateKeypair()
	const defaults = {
		id: crypto.randomUUID(),
		serverUrl: "https://test-server.com",
		signingOldToken: crypto.randomUUID(),
		signingNewToken: crypto.randomUUID(),
		encryptionOldToken: crypto.randomUUID(),
		encryptionNewToken: crypto.randomUUID(),
		newSigningPublicKey: keys.signingPublicKey,
		newEncryptionPublicKey: keys.encryptionPublicKey,
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

export async function insertServerEcho(url: string, publicKey: string, encryptionPublicKey: string) {
	await db.insert(serverRegistry).values({
		id: crypto.randomUUID(),
		url,
		publicKey,
		encryptionPublicKey,
		lastSeen: new Date(),
		createdAt: new Date(),
		updatedAt: new Date(),
		isHealthy: true,
	}).onConflictDoNothing()
}

export async function getBlacklistedServer(serverUrl: string) {
	return (await db.select().from(blacklistedServers).where(eq(blacklistedServers.serverUrl, serverUrl)))[0]
}

export async function getChallengesByServerUrl(serverUrl: string) {
	return await db.select().from(rotateChallengeTokens).where(eq(rotateChallengeTokens.serverUrl, serverUrl))
}

export async function clearBlacklist() {
	return await db.delete(blacklistedServers)
}

export async function clearTables() {
	return await Promise.all([
		clearRotateChallengeTokens(),
		clearBlacklist(),
		clearServerRegistry(),
	])
}
