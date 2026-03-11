import db from "@/lib/db";
import { blacklistedServers } from "@/lib/db/schema";
import createDebug from "debug";
import { eq } from "drizzle-orm";

const debug = createDebug("federation:blacklist");

/**
 * Check if a server URL is blacklisted.
 * Exported so route handlers can call it with body-extracted URLs.
 */
export async function isBlacklisted(serverUrl: string): Promise<boolean> {
	const [row] = await db
		.select({ id: blacklistedServers.id })
		.from(blacklistedServers)
		.where(eq(blacklistedServers.serverUrl, serverUrl))
		.limit(1);
	return !!row;
}