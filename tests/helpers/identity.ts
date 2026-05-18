import db from "@/lib/db";
import { user } from "@/lib/db/schema";

/** Minimal user row for proxy / federation fixture tests (no accounts OAuth rows). */
export async function seedMinimalUser(opts: {
	id: string;
	email: string;
	name?: string;
	isPrivate?: boolean;
}) {
	const now = new Date();
	await db.insert(user).values({
		id: opts.id,
		name: opts.name ?? "Fixture User",
		email: opts.email,
		emailVerified: true,
		createdAt: now,
		updatedAt: now,
		isPrivate: opts.isPrivate ?? false,
	});
}
