import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const sendKeysToServer = mutation({
	args: {
		userId: v.string(),
		identityKey: v.object({
			curve25519: v.string(),
			ed25519: v.string(),
		}),
		oneTimeKeys: v.array(v.object({
			keyId: v.string(),
			publicKey: v.string(),
		})),
		forceInsert: v.boolean(), // if true, insert even if user already has an olm account
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		// check if user already has an olm account
		const olmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", args.userId)).first();

		if (olmAccount && !args.forceInsert) {
			throw new Error("User already has an olm account");
		} else if (olmAccount && args.forceInsert) {
			// Keys are being rotated - increment version and update timestamp
			await ctx.db.patch(olmAccount._id, {
				identityKey: args.identityKey,
				oneTimeKeys: args.oneTimeKeys,
				updatedAt: now,
				keyVersion: (olmAccount.keyVersion || 0) + 1,
			});

			// Notify all users who have sessions with this user that their sessions are now invalid
			// This will be handled client-side by checking key versions
			console.log(`[OLM] Keys rotated for user ${args.userId}, new version: ${(olmAccount.keyVersion || 0) + 1}`);

			return { ...olmAccount, keyVersion: (olmAccount.keyVersion || 0) + 1 };
		}

		// Create new account with initial key version
		const newOlmAccount = await ctx.db.insert<"olmAccount">("olmAccount", {
			userId: args.userId,
			identityKey: args.identityKey,
			oneTimeKeys: args.oneTimeKeys || [],
			createdAt: now,
			updatedAt: now,
			keyVersion: 1,
		});

		return newOlmAccount;
	},
});

export const retrieveServerOlmAccount = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const olmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", args.userId)).first();
		if (!olmAccount) return null;

		// Ensure backward compatibility with old records that don't have keyVersion
		return {
			...olmAccount,
			keyVersion: olmAccount.keyVersion ?? 1,
			createdAt: olmAccount.createdAt ?? olmAccount._creationTime,
			updatedAt: olmAccount.updatedAt ?? olmAccount._creationTime,
		};
	},
});

export const consumeOTK = mutation({
	args: {
		userId: v.string(),
		keyId: v.string(),
	},
	handler: async (ctx, args) => {
		const olmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", args.userId)).first();
		if (!olmAccount) throw new Error("User has no OLM account");

		const oneTimeKeys = olmAccount.oneTimeKeys;
		const keyIndex = oneTimeKeys.findIndex((key) => key.keyId === args.keyId);

		if (keyIndex === -1) throw new Error("The key to be consumed was not found");

		oneTimeKeys.splice(keyIndex, 1);

		await ctx.db.patch(olmAccount._id, {
			oneTimeKeys,
		});

		return {
			consumed: true,
			keysLeft: oneTimeKeys.length
		}
	},
});

export const getKeyVersion = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const olmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", args.userId)).first();
		if (!olmAccount) return null;

		return {
			keyVersion: olmAccount.keyVersion ?? 1,
			updatedAt: olmAccount.updatedAt ?? olmAccount._creationTime,
			identityKey: olmAccount.identityKey,
		};
	},
});

/**
 * Migration mutation to add keyVersion, createdAt, updatedAt to existing olmAccount records
 * Run this once to migrate old records
 */
export const migrateOlmAccounts = mutation({
	handler: async (ctx) => {
		const accounts = await ctx.db.query("olmAccount").collect();
		let updated = 0;

		for (const account of accounts) {
			// Only update if keyVersion is missing
			if (account.keyVersion === undefined) {
				await ctx.db.patch(account._id, {
					keyVersion: 1, // Initial version for existing accounts
					createdAt: account.createdAt ?? account._creationTime,
					updatedAt: account.updatedAt ?? account._creationTime,
				});
				updated++;
			}
		}

		return {
			message: `Migrated ${updated} olmAccount records`,
			total: accounts.length,
			updated
		};
	},
});