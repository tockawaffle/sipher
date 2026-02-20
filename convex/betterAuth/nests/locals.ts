import { UserIdentity } from "convex/server";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, query, QueryCtx } from "../_generated/server";

// Overload signatures
async function userValidation(ctx: MutationCtx | QueryCtx, options: { required: false }): Promise<{ userId: Id<"user">; user: any } | null>;
async function userValidation(ctx: MutationCtx | QueryCtx, options?: { required?: true }): Promise<{ userId: Id<"user">; user: UserIdentity }>;

// Implementation
async function userValidation(ctx: MutationCtx | QueryCtx, options?: { required?: boolean }) {
	const required = options?.required ?? true;

	const user = await ctx.auth.getUserIdentity();
	if (!user) {
		if (required) throw new Error("User not found");
		return null;
	}

	const userId = ctx.db.normalizeId("user", user.subject as string) as Id<"user">;
	if (!userId) {
		if (required) throw new Error("User not found");
		return null;
	}

	return { userId, user };
}

export const getUserNests = query({
	handler: async (ctx) => {
		const { userId } = await userValidation(ctx, { required: true });
		if (!userId) throw new Error("User not found");

		const getUser = await ctx.db.get<"user">(userId);
		if (!getUser) throw new Error("User not found");
		else if (!getUser.nests || getUser.nests.length === 0) return [];

		// Get the nests the user is a member of
		const nests: Doc<"nests">[] = [];
		for (const nestId of getUser.nests) {
			const nest = await ctx.db.get<"nests">(nestId);
			if (!nest) continue;
			nests.push(nest);
		}

		return nests;
	}
});

export const getRecommendedNests = query({
	handler: async (ctx) => {
		const { userId } = await userValidation(ctx, { required: true });
		if (!userId) throw new Error("User not found");

		const getUser = await ctx.db.get<"user">(userId);
		if (!getUser) throw new Error("User not found");

		const nests = await ctx.db.query<"nests">("nests").withIndex("onDiscover", q => q.eq("onDiscover", true)).collect();
		return nests;
	}
});