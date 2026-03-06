import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	fetchOptions: {},
	plugins: [
		usernameClient(),
		twoFactorClient(),
	]
})