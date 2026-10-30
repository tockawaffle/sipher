/**
 * One-off backfill for follows written by the direct FEDERATE path before
 * PR #8, which stored the remote server in the wrong column:
 *
 * - outgoing follow (local follower → remote user): remote URL was in
 *   `followerServerUrl` instead of `followingServerUrl`;
 * - incoming follow (remote follower → local user): remote URL was in
 *   `followingServerUrl` instead of `followerServerUrl`.
 *
 * Post delivery and delivery acknowledgements now read the corrected columns,
 * so those rows must be swapped once after deploying.
 *
 * A row is only swapped when exactly one server column is set and the side it
 * names is a local user while the other side is not, which is never true of a
 * correct row. Running it twice is a no-op. Pass `--dry-run` to only count.
 */
import { sql } from "drizzle-orm";
import db from "./index";

const dryRun = process.argv.includes("--dry-run");

const outgoing = sql`
	f.follower_server_url IS NOT NULL AND f.following_server_url IS NULL
	AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = f.follower_id)
	AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = f.following_id)`;
const incoming = sql`
	f.following_server_url IS NOT NULL AND f.follower_server_url IS NULL
	AND EXISTS (SELECT 1 FROM "user" u WHERE u.id = f.following_id)
	AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = f.follower_id)`;

const swapped = await db.transaction(async (tx) => {
	if (dryRun) {
		const { rows } = await tx.execute<{ outgoing: number; incoming: number }>(sql`
			SELECT
				(SELECT count(*)::int FROM follows f WHERE ${outgoing}) AS outgoing,
				(SELECT count(*)::int FROM follows f WHERE ${incoming}) AS incoming`);
		return rows[0]!;
	}

	// Both column values move in one UPDATE, so each row is swapped exactly once.
	const { rowCount } = await tx.execute(sql`
		UPDATE follows AS f
		SET follower_server_url = f.following_server_url,
			following_server_url = f.follower_server_url
		WHERE (${outgoing}) OR (${incoming})`);
	return { rows: rowCount ?? 0 };
});

console.log(`backfill-follow-server-urls${dryRun ? " (dry run)" : ""}:`, swapped);
process.exit(0);
