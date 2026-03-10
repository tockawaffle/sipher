import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { sipherSocialClientPlugin } from "./plugins/client/social";

export const authClient = createAuthClient({
	fetchOptions: {},
	plugins: [
		usernameClient(),
		twoFactorClient(),
		sipherSocialClientPlugin(),
	]
})