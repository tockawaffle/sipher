import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { oneTimeTokenClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	plugins: [
		convexClient(),
		usernameClient(),
		oneTimeTokenClient()
	],
	sessionOptions: {
		refetchOnWindowFocus: false,
	},
});