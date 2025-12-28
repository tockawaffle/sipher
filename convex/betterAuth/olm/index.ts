import { v } from "convex/values";
import { Id } from "../../_generated/dataModel";
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

		// check if user already has an olm account
		const olmAccount = await ctx.db.query("olmAccount").withIndex("userId", (q) => q.eq("userId", args.userId)).first();

		if (olmAccount && !args.forceInsert) {
			throw new Error("User already has an olm account");
		}

		const insert = await ctx.db.insert<"olmAccount">("olmAccount", {
			userId: args.userId,
			identityKey: args.identityKey,
			oneTimeKeys: args.oneTimeKeys,
		});

		console.log("insert", insert);
		return insert;
	},
});

export const retrieveServerOlmAccount = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, args) => {
		const olmAccount = await ctx.db.get<"olmAccount">(args.userId as Id<"olmAccount">);
		if (olmAccount) return olmAccount;

		return null;
	},
});