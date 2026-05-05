"use server";

import CreateIdentity from "@/components/main/CreateIdentity";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PostTestForm } from "./PostTestForm";

export default async function Home() {
	const reqHeaders = await headers();

	const session = await auth.api.getSession({ headers: reqHeaders });
	if (!session) redirect(`/auth`);

	// Server components can't talk to the browser-side `authClient`, so we hit
	// the plugin endpoint via `auth.api`. This only tells us whether the
	// identity is registered remotely; the local Dexie half is verified inside
	// `CreateIdentity` (client component) when needed.
	const result = await auth.api.checkIdentity({ headers: reqHeaders });
	const hasIdentity = "exists" in result && result.exists;
	if (!hasIdentity) {
		console.debug(`[Home] user ${session.user.id} has no identity, showing create identity modal`);
		return <CreateIdentity />;
	}

	return (
		<>
			<PostTestForm />
		</>
	);
}
