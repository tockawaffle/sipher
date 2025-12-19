import { v } from "convex/values";
import { Id } from "../../_generated/dataModel";
import { mutation } from "../../_generated/server";

export const updateUserStatus = mutation({
	args: {
		status: v.string(),
		isUserSet: v.boolean(),
	},
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) {
			throw new Error("User not found");
		}

		const userId = ctx.db.normalizeId("user", user.subject as string) as Id<"user">;
		if (!userId) {
			throw new Error("User not found");
		}

		return ctx.db.patch<"user">("user", userId, {
			status: {
				status: args.status,
				isUserSet: args.isUserSet,
			},
		});
	},
});