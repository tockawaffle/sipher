import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { sipherOvenClientPlugin } from "./plugins/oven/client";
import { sipherSocialClientPlugin } from "./plugins/social/client/social";

export const authClient = createAuthClient({
	fetchOptions: {},
	plugins: [
		usernameClient(),
		twoFactorClient(),
		sipherSocialClientPlugin(),
		sipherOvenClientPlugin(),
	]
})