"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { ErrorContext } from "better-auth/react";
import { Check, Eye, EyeOff, Loader2, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function SignUpForm(
	{ captchaToken, setShowSignIn }: { captchaToken: string | null, setShowSignIn: (show: boolean) => void }
) {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(false);
	const [isValidatingUsername, setIsValidatingUsername] = useState(false);
	const [showPassword, setShowPassword] = useState(false);

	const handleSignUp = async (e: React.FormEvent) => {
		e.preventDefault();
		if (password !== confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}

		if (password.length > 30) {
			toast.error("Password must be less than 30 characters");
			return;
		}

		await authClient.signUp.email(
			{
				email: `${username}.user@sipher.space`,
				name: username,
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
				onSuccess: async () => {
					setLoading(false);
					toast.success("Account created successfully, now log in to continue!");
					setShowSignIn(true);
					router.push("/");
				},
				onError: (ctx: ErrorContext) => {
					setLoading(false);
					toast.error(ctx.error.message);
				},

			}
		);
	};

	const generatePassword = () => {
		const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
		let newPassword = "";
		for (let i = 0; i < 16; i++) {
			newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		setPassword(newPassword);
		setConfirmPassword(newPassword);
		navigator.clipboard.writeText(newPassword);
		toast.success("Password generated and copied to clipboard");
	};

	return (
		<form onSubmit={handleSignUp} className="grid gap-4">
			<div className="grid gap-2">
				<Label htmlFor="username">Username</Label>
				<div className="relative">
					<Input
						id="username"
						type="text"
						placeholder="john_doe"
						required
						value={username}
						onChange={async (e) => {
							const val = e.target.value;
							setUsername(val);
							if (val) {
								setIsValidatingUsername(true);
								// @ts-ignore
								const isValid = await authClient.isUsernameAvailable({ username: val });
								setIsUsernameAvailable(!!isValid);
								setIsValidatingUsername(false);
							} else {
								setIsUsernameAvailable(null);
							}
						}}
						className={`bg-background/50 focus:bg-background transition-colors pr-10 ${isUsernameAvailable === false ? "border-red-500 focus-visible:ring-red-500" :
							isUsernameAvailable === true ? "border-green-500 focus-visible:ring-green-500" : ""
							}`}
					/>
					<div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						{isValidatingUsername ? (
							<Loader2 className="size-4 animate-spin" />
						) : isUsernameAvailable === true ? (
							<Check className="size-4 text-green-500" />
						) : isUsernameAvailable === false ? (
							<X className="size-4 text-red-500" />
						) : null}
					</div>
				</div>
				{isUsernameAvailable === false && (
					<p className="text-xs text-red-500">Username is already taken</p>
				)}
			</div>
			<div className="grid gap-2">
				<Label htmlFor="password">Password</Label>
				<div className="relative">
					<Input
						id="password"
						type={showPassword ? "text" : "password"}
						placeholder="********"
						autoComplete="new-password"
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className={`bg-background/50 focus:bg-background transition-colors pr-24 ${password.length >= 8 && password.length <= 30
							? "border-green-500 focus-visible:ring-green-500"
							: password.length > 30
								? "border-red-500 focus-visible:ring-red-500"
								: ""
							}`}
					/>
					<div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
						{password.length > 30 ? (
							<X className="size-4 text-red-500" />
						) : password.length >= 8 && (
							<Check className="size-4 text-green-500" />
						)}
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 text-muted-foreground hover:text-primary"
							onClick={() => setShowPassword(!showPassword)}
							title={showPassword ? "Hide password" : "Show password"}
						>
							{showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 text-muted-foreground hover:text-primary"
							onClick={generatePassword}
							title="Generate secure password"
						>
							<RefreshCw className="size-3" />
						</Button>
					</div>
				</div>
				{password.length > 30 && (
					<p className="text-xs text-red-500">Password must be less than 30 characters</p>
				)}
			</div>
			<div className="grid gap-2">
				<Label htmlFor="confirmPassword">Confirm Password</Label>
				<div className="relative">
					<Input
						id="confirmPassword"
						type={showPassword ? "text" : "password"}
						placeholder="********"
						autoComplete="new-password"
						required
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						className={`bg-background/50 focus:bg-background transition-colors pr-10 ${confirmPassword && password === confirmPassword && password.length <= 30
							? "border-green-500 focus-visible:ring-green-500"
							: (confirmPassword && password !== confirmPassword) || (confirmPassword && password.length > 30)
								? "border-red-500 focus-visible:ring-red-500"
								: ""
							}`}
					/>
					<div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
						{confirmPassword && password === confirmPassword && password.length <= 30 ? (
							<Check className="size-4 text-green-500" />
						) : confirmPassword && (password !== confirmPassword || password.length > 30) ? (
							<X className="size-4 text-red-500" />
						) : null}
					</div>
				</div>
				{confirmPassword && password !== confirmPassword && (
					<p className="text-xs text-red-500">Passwords do not match</p>
				)}
			</div>
			<Button
				type="submit"
				className="w-full font-semibold mt-2"
				disabled={
					loading ||
					isUsernameAvailable === false ||
					password !== confirmPassword ||
					password.length < 8 ||
					password.length > 30
				}
			>
				{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign Up"}
			</Button>
		</form>
	);
}
