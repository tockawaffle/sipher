import { createAuthEndpoint } from "better-auth/api"
import { z } from "zod"

export const createBlock = createAuthEndpoint("/social/blocks", {
	method: "POST",
}, async (context) => { })

export const deleteBlock = createAuthEndpoint("/social/blocks/:id", {
	method: "DELETE",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => { })

export const getBlocks = createAuthEndpoint("/social/blocks", {
	method: "GET",
}, async (context) => { })	