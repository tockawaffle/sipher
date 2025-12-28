import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { inferAdditionalFields, oneTimeTokenClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { auth } from "../../../convex/betterAuth/auth";

export const authClient = createAuthClient({
	plugins: [
		convexClient(),
		usernameClient(),
		oneTimeTokenClient(),
		inferAdditionalFields<typeof auth>(),
	],
	sessionOptions: {
		refetchOnWindowFocus: false,
	},
});