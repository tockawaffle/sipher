/**
 * Generates unique Ed25519 + X25519 federation keypairs AND a random
 * BETTER_AUTH_SECRET for each Sipher instance, writing everything into
 * tests/docker/sipher-{a,b,c}.env (created from *.env.example if not yet present).
 *
 * Usage:
 *   bun run docker:generate-keys
 *
 * Run this once before the first `docker compose up`. Re-running rotates all
 * secrets — wipe the databases afterwards if you do that intentionally.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import nacl from "tweetnacl";

const DOCKER_DIR = dirname(fileURLToPath(import.meta.url));

function generateSecrets() {
	const signing = nacl.sign.keyPair();
	const encryption = nacl.box.keyPair();
	return {
		BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
		FEDERATION_PUBLIC_KEY: Buffer.from(signing.publicKey).toString("base64"),
		FEDERATION_PRIVATE_KEY: Buffer.from(signing.secretKey).toString("base64"),
		FEDERATION_ENCRYPTION_PUBLIC_KEY: Buffer.from(encryption.publicKey).toString("base64"),
		FEDERATION_ENCRYPTION_PRIVATE_KEY: Buffer.from(encryption.secretKey).toString("base64"),
	};
}

/**
 * Replace `KEY=<placeholder>` or `KEY=` lines in an env-file string.
 * Matches both empty values and the CHANGE_ME_* placeholder values used in the
 * example files so the script is idempotent on first run.
 */
function injectSecrets(content: string, secrets: ReturnType<typeof generateSecrets>): string {
	let out = content;
	for (const [k, v] of Object.entries(secrets)) {
		out = out.replace(
			new RegExp(`^(${k})=.*$`, "m"),
			`$1=${v}`,
		);
	}
	return out;
}

const instances = ["a", "b", "c"] as const;

for (const id of instances) {
	const examplePath = join(DOCKER_DIR, `sipher-${id}.env.example`);
	const outPath = join(DOCKER_DIR, `sipher-${id}.env`);

	const template = readFileSync(examplePath, "utf8");

	// If the env file already exists, start from it so any other custom edits
	// (e.g. EMAIL_*, MINIO_*) are preserved; otherwise seed from the template.
	const base = existsSync(outPath) ? readFileSync(outPath, "utf8") : template;

	const secrets = generateSecrets();
	const content = injectSecrets(base, secrets);

	writeFileSync(outPath, content, "utf8");
	console.log(`✔ tests/docker/sipher-${id}.env`);
	console.log(`    BETTER_AUTH_SECRET: ${secrets.BETTER_AUTH_SECRET.slice(0, 8)}…`);
	console.log(`    signing key:        ${secrets.FEDERATION_PUBLIC_KEY.slice(0, 12)}…`);
	console.log(`    encryption key:     ${secrets.FEDERATION_ENCRYPTION_PUBLIC_KEY.slice(0, 12)}…`);
}

console.log(`
Done. Next steps:
  1. docker compose -f tests/docker-compose.yml --profile init up      # push DB schema
  2. docker compose -f tests/docker-compose.yml up -d                  # start cluster
  3. docker compose -f tests/docker-compose.yml --profile setup up     # mutual discovery
  4. Run integration tests inside Docker:
       docker compose -f tests/docker-compose.yml run --rm test-runner \\
         tests/integration/proxy-chain.ts \\
         --proxy http://sipher-b:3001 --target http://sipher-c:3002
`);
