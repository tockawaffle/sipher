/**
 * This script is used to rotate the keys of the federation.
 * It will go through all known federations and request the key rotation challenge one by one.
 * It will then solve the challenges and send the proofs to the federation that we are who we say we are.
 *
 * This script is meant to be run manually and should not under any circumstances be run automatically under an endpoint.
 *
 * Usage:
 *   bun run rotateKeys.ts                                — generate fresh keys and rotate all federations
 *   bun run rotateKeys.ts --resume <json>                — retry all federations with previously generated keys
 *   bun run rotateKeys.ts --resume <json> --only <urls>  — retry only specific federations (comma-separated URLs)
 */

import db from "@/lib/db";
import { serverRegistry } from "@/lib/db/schema";
import { decryptPayload, EncryptedEnvelope, encryptPayload, signMessage } from "@/lib/federation/keytools";
import { config } from "dotenv";
import nacl from "tweetnacl";

config({ path: ".env.local" });

const FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FedKeys {
	signingPublicKey: string;
	signingSecretKey: string;
	encryptionPublicKey: string;
	encryptionSecretKey: string;
}

function generateKeypair(): FedKeys {
	const signing = nacl.sign.keyPair();
	const encryption = nacl.box.keyPair();
	return {
		signingPublicKey: Buffer.from(signing.publicKey).toString("base64"),
		signingSecretKey: Buffer.from(signing.secretKey).toString("base64"),
		encryptionPublicKey: Buffer.from(encryption.publicKey).toString("base64"),
		encryptionSecretKey: Buffer.from(encryption.secretKey).toString("base64"),
	};
}

function printKeys(label: string, keys: FedKeys) {
	console.log(label);
	console.log(`  FEDERATION_PUBLIC_KEY=${keys.signingPublicKey}`);
	console.log(`  FEDERATION_PRIVATE_KEY=${keys.signingSecretKey}`);
	console.log(`  FEDERATION_ENCRYPTION_PUBLIC_KEY=${keys.encryptionPublicKey}`);
	console.log(`  FEDERATION_ENCRYPTION_PRIVATE_KEY=${keys.encryptionSecretKey}`);
}

async function readErrorBody(response: Response): Promise<string> {
	try {
		const body = await response.json();
		return body?.error ?? body?.message ?? JSON.stringify(body);
	} catch {
		try {
			return await response.text();
		} catch {
			return response.statusText;
		}
	}
}

async function confirm(prompt: string): Promise<boolean> {
	process.stdout.write(`${prompt} [y/N] `);
	for await (const line of console) {
		return line.trim().toLowerCase() === "y";
	}
	return false;
}

// ---------------------------------------------------------------------------
// Validate environment
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
	"FEDERATION_PUBLIC_KEY",
	"FEDERATION_PRIVATE_KEY",
	"FEDERATION_ENCRYPTION_PUBLIC_KEY",
	"FEDERATION_ENCRYPTION_PRIVATE_KEY",
	"BETTER_AUTH_URL",
] as const;

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
	console.error("Missing required environment variables:");
	missing.forEach((k) => console.error(`  - ${k}`));
	console.error("Ensure .env.local is present and populated.");
	process.exit(1);
}

const oldFedKeys: FedKeys = {
	signingPublicKey: process.env.FEDERATION_PUBLIC_KEY!,
	signingSecretKey: process.env.FEDERATION_PRIVATE_KEY!,
	encryptionPublicKey: process.env.FEDERATION_ENCRYPTION_PUBLIC_KEY!,
	encryptionSecretKey: process.env.FEDERATION_ENCRYPTION_PRIVATE_KEY!,
};

const ORIGIN = process.env.BETTER_AUTH_URL!;

// ---------------------------------------------------------------------------
// Parse --resume flag
// ---------------------------------------------------------------------------

let newFedKeys: FedKeys;

const resumeIdx = process.argv.indexOf("--resume");
if (resumeIdx !== -1) {
	const raw = process.argv[resumeIdx + 1];
	if (!raw) {
		console.error("--resume requires a JSON string argument containing the new keys.");
		process.exit(1);
	}
	try {
		const parsed = JSON.parse(raw);
		if (
			!parsed.signingPublicKey ||
			!parsed.signingSecretKey ||
			!parsed.encryptionPublicKey ||
			!parsed.encryptionSecretKey
		) {
			throw new Error("Missing key fields");
		}
		newFedKeys = parsed as FedKeys;
		console.log("Resuming rotation with previously generated keys.");
	} catch (err) {
		console.error("Failed to parse --resume keys:", (err as Error).message);
		process.exit(1);
	}
} else {
	newFedKeys = generateKeypair();
}

// ---------------------------------------------------------------------------
// Parse --only filter
// ---------------------------------------------------------------------------

const onlyIdx = process.argv.indexOf("--only");
let onlyUrls: Set<string> | null = null;
if (onlyIdx !== -1) {
	const raw = process.argv[onlyIdx + 1];
	if (!raw) {
		console.error("--only requires a comma-separated list of federation URLs.");
		process.exit(1);
	}
	onlyUrls = new Set(raw.split(",").map((u) => u.trim()).filter(Boolean));
	if (onlyUrls.size === 0) {
		console.error("--only list is empty.");
		process.exit(1);
	}
}

// ---------------------------------------------------------------------------
// Fetch federations
// ---------------------------------------------------------------------------

const allFederations = await db.select().from(serverRegistry);

if (allFederations.length === 0) {
	console.log("No federations found in the registry. Nothing to rotate.");
	process.exit(0);
}

const federations = onlyUrls
	? allFederations.filter((f) => onlyUrls!.has(f.url))
	: allFederations;

if (federations.length === 0) {
	console.error("None of the --only URLs matched federations in the registry:");
	onlyUrls!.forEach((u) => console.error(`  - ${u}`));
	process.exit(1);
}

if (onlyUrls) {
	const unmatched = [...onlyUrls].filter((u) => !federations.some((f) => f.url === u));
	if (unmatched.length > 0) {
		console.warn("Warning: these --only URLs were not found in the registry and will be skipped:");
		unmatched.forEach((u) => console.warn(`  - ${u}`));
	}
}

console.log(`Targeting ${federations.length} federation(s) for key rotation:`);
federations.forEach((f) => console.log(`  - ${f.url}`));

if (!await confirm("\nProceed with key rotation?")) {
	console.log("Aborted.");
	process.exit(0);
}

// ---------------------------------------------------------------------------
// Solve init challenges
// ---------------------------------------------------------------------------

interface InitChallenges {
	signingOldChallenge: string;
	signingNewChallenge: string;
	encryptionOldChallenge: EncryptedEnvelope;
	encryptionNewChallenge: EncryptedEnvelope;
}

function solveInitChallenges(challenges: InitChallenges, oldKeys: FedKeys, newKeys: FedKeys) {
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

// ---------------------------------------------------------------------------
// Rotate each federation
// ---------------------------------------------------------------------------

const transactions: Array<{
	url: string;
	success: boolean;
	message: string;
}> = [];

for (const federation of federations) {
	const tag = federation.url;
	console.log(`\n[${tag}] Requesting rotation challenge...`);

	try {
		// Step 1 — Init challenge
		const initResponse = await fetch(`${federation.url}/discover/rotate/init`, {
			method: "POST",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"Content-Type": "application/json",
				"Origin": ORIGIN,
				"x-federation-origin": ORIGIN,
			},
			body: JSON.stringify({
				url: ORIGIN,
				newSigningPublicKey: newFedKeys.signingPublicKey,
				newEncryptionPublicKey: newFedKeys.encryptionPublicKey,
			}),
		});

		if (!initResponse.ok) {
			const detail = await readErrorBody(initResponse);
			console.error(`[${tag}] Init failed (${initResponse.status}): ${detail}`);
			transactions.push({ url: tag, success: false, message: detail });
			continue;
		}

		const challenges: InitChallenges = await initResponse.json();

		// Step 2 — Fetch the federation's public encryption key
		const discoverResponse = await fetch(`${federation.url}/discover`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"Content-Type": "application/json",
				"Origin": ORIGIN,
				"x-federation-origin": ORIGIN,
			},
		});

		if (!discoverResponse.ok) {
			const detail = await readErrorBody(discoverResponse);
			console.error(`[${tag}] Discover failed (${discoverResponse.status}): ${detail}`);
			transactions.push({ url: tag, success: false, message: detail });
			continue;
		}

		const discoverData: {
			url: string;
			publicKey: string;
			encryptionPublicKey: string;
		} = await discoverResponse.json();

		// Step 3 — Solve challenges
		const proofs = solveInitChallenges(challenges, oldFedKeys, newFedKeys);

		// Step 4 — Encrypt proofs with the federation's encryption public key
		const encPubKey = new Uint8Array(Buffer.from(discoverData.encryptionPublicKey, "base64"));
		const encryptedProofs = encryptPayload(JSON.stringify(proofs), encPubKey);

		// Step 5 — Confirm
		const confirmResponse = await fetch(`${federation.url}/discover/rotate/confirm`, {
			method: "POST",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: {
				"Content-Type": "application/json",
				"Origin": ORIGIN,
				"x-federation-origin": ORIGIN,
			},
			body: JSON.stringify({
				serverUrl: ORIGIN,
				envelope: encryptedProofs,
			}),
		});

		if (!confirmResponse.ok) {
			const detail = await readErrorBody(confirmResponse);
			console.error(`[${tag}] Confirm failed (${confirmResponse.status}): ${detail}`);
			transactions.push({ url: tag, success: false, message: detail });
			continue;
		}

		const confirmData = await confirmResponse.json();
		console.log(`[${tag}] ${confirmData.message}`);
		transactions.push({ url: tag, success: true, message: confirmData.message });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[${tag}] Unexpected error: ${message}`);
		transactions.push({ url: tag, success: false, message });
	}
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const successes = transactions.filter((t) => t.success);
const failures = transactions.filter((t) => !t.success);

console.log("\n================================");
console.log(`Results: ${successes.length} succeeded, ${failures.length} failed out of ${transactions.length}`);

if (failures.length > 0) {
	console.error("\nFailed federations:");
	failures.forEach((f) => console.error(`  - ${f.url}: ${f.message}`));

	const resumePayload = JSON.stringify(newFedKeys);
	const failedUrls = failures.map((f) => f.url).join(",");

	if (successes.length > 0) {
		console.error("\nKeys NOT written to .env.local (some federations succeeded, some failed).");
		console.error("Retry ONLY the failed federations with:\n");
		console.log(`  bun run rotateKeys.ts --resume '${resumePayload}' --only '${failedUrls}'\n`);
	} else {
		console.error("\nKeys NOT written to .env.local. Retry with:\n");
		console.log(`  bun run rotateKeys.ts --resume '${resumePayload}'\n`);
	}
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Write new keys to .env.local (with backup)
// ---------------------------------------------------------------------------

const envPath = ".env.local";
const envContent = await Bun.file(envPath).text();

const backupPath = `.env.local.bak.${Date.now()}`;
await Bun.write(backupPath, envContent);
console.log(`\nBacked up .env.local → ${backupPath}`);

const envReplacements: [RegExp, string][] = [
	[/FEDERATION_PUBLIC_KEY=.*/, `FEDERATION_PUBLIC_KEY="${newFedKeys.signingPublicKey}"`],
	[/FEDERATION_PRIVATE_KEY=.*/, `FEDERATION_PRIVATE_KEY="${newFedKeys.signingSecretKey}"`],
	[/FEDERATION_ENCRYPTION_PUBLIC_KEY=.*/, `FEDERATION_ENCRYPTION_PUBLIC_KEY="${newFedKeys.encryptionPublicKey}"`],
	[/FEDERATION_ENCRYPTION_PRIVATE_KEY=.*/, `FEDERATION_ENCRYPTION_PRIVATE_KEY="${newFedKeys.encryptionSecretKey}"`],
];

let updatedEnv = envContent;
for (const [pattern, replacement] of envReplacements) {
	if (!pattern.test(updatedEnv)) {
		console.error(`Warning: ${pattern.source.split("=")[0]} not found in .env.local — appending.`);
		updatedEnv += `\n${replacement}`;
	} else {
		updatedEnv = updatedEnv.replace(pattern, replacement);
	}
}

await Bun.write(envPath, updatedEnv);

console.log("New keys written to .env.local successfully.");
printKeys("\nOld keys (displayed once, not stored anywhere):", oldFedKeys);
