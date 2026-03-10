import type { BetterAuthClientPlugin } from "better-auth/client";
import { z } from "zod";
import { postContentSchema } from "../server/helpers/social/social";
import type { sipherSocial } from "../server/social";

type SipherSocialPlugin = typeof sipherSocial;

export const sipherSocialClientPlugin = () => {
	return {
		id: "sipher-social",
		$InferServerPlugin: {} as ReturnType<SipherSocialPlugin>,
		getActions($fetch, $store, options) {
			return {
				createPost: async (content: z.infer<typeof postContentSchema>) => {
					const response = await $fetch("/social/posts", {
						method: "POST",
						body: {
							content,
						},
					});
					return response;
				}
			}
		},
	} satisfies BetterAuthClientPlugin;
};