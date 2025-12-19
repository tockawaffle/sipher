"use client";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import Captcha, { CaptchaRef } from "@/components/ui/captcha";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { AnimatePresence, motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SignInForm } from "./components/sign-in-form";
import { SignUpForm } from "./components/sign-up-form";

export default function AuthPage() {
	const { data, error, isPending } = authClient.useSession();
	const [captchaToken, setCaptchaToken] = useState<string | null>(null);
	const [method, setMethod] = useState<"signIn" | "signUp">("signIn");
	const captchaRef = useRef<CaptchaRef>(null);



	useEffect(() => {
		if (error && error.status !== 404) {
			console.error("[AuthPage] > Error:", error);
			toast.error(error.message);
		} else if (data) {
			console.log(`[AuthPage] > User ${data.user.username} logged in, redirecting to home...`);
			redirect("/");
		}
	}, [error, data])

	if (isPending) {
		return (
			<div className="flex items-center justify-center h-screen w-full bg-background">
				<Spinner className="size-10 animate-spin text-primary" />
			</div>
		);
	}

	const toggleMethod = () => {
		setMethod(method === "signIn" ? "signUp" : "signIn");
	};

	return (
		<div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden p-4">
			{/* Animated Background Blobs */}
			<motion.div
				animate={{
					scale: [1, 1.2, 1],
					rotate: [0, 90, 0],
				}}
				transition={{
					duration: 20,
					repeat: Infinity,
					ease: "linear",
				}}
				className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 pointer-events-none"
			/>
			<motion.div
				animate={{
					scale: [1, 1.1, 1],
					rotate: [0, -60, 0],
				}}
				transition={{
					duration: 15,
					repeat: Infinity,
					ease: "linear",
				}}
				className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-accent/20 rounded-full mix-blend-multiply filter blur-[100px] opacity-50 pointer-events-none"
			/>

			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.5, type: "spring" }}
				className="w-full max-w-md z-10"
			>
				<Card className="backdrop-blur-md bg-card/90 border-muted/50 shadow-2xl relative">
					<div className="absolute top-4 right-4">
						<ModeToggle />
					</div>
					<CardHeader className="space-y-1 text-center">
						<AnimatePresence mode="wait">
							<motion.div
								key={method}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -20 }}
								transition={{ duration: 0.2 }}
							>
								<CardTitle className="text-2xl font-bold">
									{method === "signIn" ? "Welcome Back" : "Create Account"}
								</CardTitle>
								<CardDescription>
									{method === "signIn"
										? "Enter your credentials to access your account"
										: "Enter your details to get started with us"}
								</CardDescription>
							</motion.div>
						</AnimatePresence>
					</CardHeader>
					<CardContent>
						{method === "signIn" ? <SignInForm captchaToken={captchaToken} /> : <SignUpForm captchaToken={captchaToken} setShowSignIn={() => setMethod("signIn")} />}
					</CardContent>
					<CardFooter className="flex flex-col gap-4 pt-2">
						<div className="text-center text-sm text-muted-foreground">
							{method === "signIn" ? "Don't have an account? " : "Already have an account? "}
							<button
								type="button"
								onClick={toggleMethod}
								className="font-semibold text-primary hover:underline focus:outline-none"
							>
								{method === "signIn" ? "Sign up" : "Sign in"}
							</button>
						</div>
						{/* Turnstile */}
						<div className="flex flex-col justify-center items-center gap-2">
							<Captcha ref={captchaRef} onSuccess={setCaptchaToken} />
							{/* Reload the captcha */}
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setCaptchaToken(null);
									captchaRef.current?.reset();
								}}
							>
								<RefreshCw className="size-4" />
								<div className="border-px border-l border-border h-full ml-2" />
								<span className="text-xs">Reload Captcha</span>
							</Button>
						</div>

						<div className="flex justify-center w-full border-t pt-4">
							<p className="text-center text-xs text-muted-foreground">
								built with{" "}
								<Link
									href="https://better-auth.com"
									className="underline hover:text-primary transition-colors"
									target="_blank"
								>
									better-auth
								</Link>
							</p>
						</div>
					</CardFooter>
				</Card>
			</motion.div>
		</div>
	);
}
