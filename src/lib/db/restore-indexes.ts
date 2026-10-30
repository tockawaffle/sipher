/**
 * Re-adds the unique indexes that `auth generate` cannot emit, after
 * `bun run db:generate` rewrites `src/lib/db/schema/index.ts`.
 *
 * Better Auth only declares unique indexes on required fields, and these
 * cover optional ones. Without them, `drizzle-kit push` would drop the indexes
 * that federated post de-duplication (`onConflictDoNothing`) and the server
 * registry rely on.
 *
 * Idempotent: an index already in the file is left alone. Exits non-zero if a
 * table cannot be found, so `db:generate` never leaves a schema without them.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA_PATH = process.argv[2] ?? "src/lib/db/schema/index.ts";

const HAND_WRITTEN: { table: string; name: string; line: string }[] = [
	{
		table: "posts",
		name: "posts_federation_origin_uidx",
		line: 'uniqueIndex("posts_federation_origin_uidx").on(table.federationUrl, table.federationPostId),',
	},
	{
		table: "serverRegistry",
		name: "serverRegistry_publicKey_uidx",
		line: 'uniqueIndex("serverRegistry_publicKey_uidx").on(table.publicKey),',
	},
	{
		table: "serverRegistry",
		name: "serverRegistry_encryptionPublicKey_uidx",
		line: 'uniqueIndex("serverRegistry_encryptionPublicKey_uidx").on(table.encryptionPublicKey),',
	},
];

let source = readFileSync(SCHEMA_PATH, "utf8");

for (const { table, name, line } of HAND_WRITTEN) {
	if (source.includes(`"${name}"`)) continue;

	const tableStart = source.indexOf(`export const ${table} = pgTable(`);
	const extra = tableStart === -1 ? -1 : source.indexOf("(table) => [", tableStart);
	const nextTable = source.indexOf("export const ", tableStart + 1);
	if (tableStart === -1 || extra === -1 || (nextTable !== -1 && extra > nextTable)) {
		console.error(`restore-indexes: no index list for table "${table}" in ${SCHEMA_PATH}`);
		process.exit(1);
	}

	const at = extra + "(table) => [".length;
	source = `${source.slice(0, at)}\n    // Hand-written, restored by src/lib/db/restore-indexes.ts.\n    ${line}${source.slice(at)}`;
	console.log(`restore-indexes: added ${name}`);
}

const pgCoreImport = source.match(/import \{([^}]*)\} from "drizzle-orm\/pg-core";/);
if (!pgCoreImport) {
	console.error(`restore-indexes: no drizzle-orm/pg-core import in ${SCHEMA_PATH}`);
	process.exit(1);
}
if (!/\buniqueIndex\b/.test(pgCoreImport[1]!)) {
	source = source.replace(pgCoreImport[0], pgCoreImport[0].replace(/,?\s*\} from/, ",\n  uniqueIndex,\n} from"));
}

writeFileSync(SCHEMA_PATH, source);
