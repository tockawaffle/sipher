import { createAuthEndpoint } from "better-auth/api"
import { z } from "zod"

export const createMute = createAuthEndpoint("/social/mutes", {
	method: "POST",
}, async (context) => { })

export const deleteMute = createAuthEndpoint("/social/mutes/:id", {
	method: "DELETE",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => { })

export const getMutes = createAuthEndpoint("/social/mutes", {
	method: "GET",
}, async (context) => { })

