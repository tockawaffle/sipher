"use client"
import AppSidebar from "@/components/home";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { redirect } from "next/navigation";

export default function Home() {
	const { data, error, isPending, } = authClient.useSession();

	if (isPending) {
		return <div className="flex items-center justify-center h-screen w-full bg-background">
			<Spinner className="size-10 animate-spin" />
		</div>
	}

	if (error || !data) {
		return redirect(`/auth${error ? `?error=${error.cause}` : ""}`);
	}

	return (
		<>
			<AppSidebar>
				<div className="flex-1 p-6 flex items-start justify-center">
				</div>
			</AppSidebar>
		</>
	)
}