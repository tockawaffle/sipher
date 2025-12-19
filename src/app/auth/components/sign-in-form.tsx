"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { ErrorContext } from "better-auth/react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function SignInForm(
	{ captchaToken }: { captchaToken: string | null }
) {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		await authClient.signIn.username(
			{
				username,
				password,
				fetchOptions: {
					headers: {
						"x-captcha-response": captchaToken ?? "",
					},
				},
			},
			{
				onRequest: () => {
					setLoading(true);
				},
				onSuccess: (d: any) => {
					console.log(d)
					setLoading(false);
					toast.success("Signed in successfully");
					router.push("/");
				},
				onError: (ctx: ErrorContext) => {
					setLoading(false);
					toast.error(ctx.error.message);
				},

			}
		);
	};

	return (
		<form onSubmit={handleSignIn} className="grid gap-4">
			<div className="grid gap-2">
				<Label htmlFor="username">Username</Label>
				<Input
					id="username"
					type="text"
					placeholder="john_doe"
					required
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					className="bg-background/50 focus:bg-background transition-colors"
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="password">Password</Label>
				<Input
					id="password"
					type="password"
					placeholder="********"
					autoComplete="current-password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="bg-background/50 focus:bg-background transition-colors"
				/>
			</div>
			<Button
				type="submit"
				className="w-full font-semibold mt-2"
				disabled={loading}
			>
				{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
			</Button>
		</form>
	);
}

