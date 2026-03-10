import { createAuthEndpoint } from "better-auth/api"
import { z } from "zod"

export const followUser = createAuthEndpoint("/social/follows", {
	method: "POST",
}, async (context) => { })

export const unfollowUser = createAuthEndpoint("/social/follows/:id", {
	method: "DELETE",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => { })

export const getFollows = createAuthEndpoint("/social/follows/following", {
	method: "GET",
}, async (context) => { })

export const getFollowers = createAuthEndpoint("/social/follows/followers", {
	method: "GET",
}, async (context) => { })