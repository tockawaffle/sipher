"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PostTestForm } from "./PostTestForm";

export default async function Home() {

	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session) redirect(`/auth`);



	return (
		<>
			<PostTestForm />

		</>
	);
}
