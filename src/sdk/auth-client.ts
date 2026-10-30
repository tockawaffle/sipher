import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";
import { sipherOvenClientPlugin } from "./plugins/oven";
import { sipherSocialClientPlugin } from "./plugins/social";

export const authClient = createAuthClient({
	fetchOptions: {},
	plugins: [
		usernameClient(),
		twoFactorClient(),
		sipherSocialClientPlugin(),
		sipherOvenClientPlugin(),
	]
})