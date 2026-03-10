import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";
import { postContentSchema } from "../social";

export const createPost = createAuthEndpoint("/social/posts", {
	method: "POST",
	body: postContentSchema,
}, async (context) => {
	const content = context.body;
	const user = getSessionFromCtx(context)

	if (!user) {
		return context.json({ error: "Unauthorized" }, { status: 401 });
	}

	console.log(content);
	return context.json({ message: "Hello, world!" }, { status: 200 });
});

export const getPost = createAuthEndpoint("/social/posts/:id", {
	method: "GET",
	params: z.object({
		id: z.string(),
	}),
}, async (context) => { })