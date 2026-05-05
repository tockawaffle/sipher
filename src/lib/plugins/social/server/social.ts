import type { BetterAuthPlugin } from "better-auth";

import * as socialEndpoints from "./helpers/endpoints";
import socialSchema from "./helpers/social";

export const sipherSocial = () => {
	return {
		id: "sipher-social",
		schema: socialSchema,
		endpoints: {
			...socialEndpoints,
		}
	} satisfies BetterAuthPlugin;
}