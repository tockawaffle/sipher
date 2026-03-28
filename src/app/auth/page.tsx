"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ForgotPasswordForm, ResetPasswordModal, SettingsDropdown, SignInForm, SignUpForm, VerifyEmailModal } from "./components";

function AuthPageContent() {
	const searchParams = useSearchParams();
	const method = searchParams.get("method") as "signUp" | "signIn";
	const type = searchParams.get("type");

	const { data: session, error: sessionError, isPending } = authClient.useSession();
	const router = useRouter();
	const [view, setView] = useState<"signIn" | "signUp" | "forgotPassword">(
		type === "orgInvite" ? (method === "signUp" ? "signUp" : "signIn") : "signIn"
	);
	const [isResetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
	const [isVerifyEmailModalOpen, setVerifyEmailModalOpen] = useState(false);
	const [emailToVerify, setEmailToVerify] = useState("");

	useEffect(() => {
		const viewParam = searchParams.get("view");
		if (viewParam?.startsWith("resetPassword")) {
			setResetPasswordModalOpen(true);
		}
	}, [searchParams]);


	if (session === undefined) {
		return (
			<div className="flex h-screen w-screen items-center justify-center bg-background">
				<Loader2 className="h-10 w-10 animate-spin text-primary" />
			</div>
		)
	} else if (session !== null && "user" in session) {
		router.replace("/");
	}

	return (
		<>
			<ResetPasswordModal
				isOpen={isResetPasswordModalOpen}
				setIsOpen={setResetPasswordModalOpen}
			/>
			<VerifyEmailModal
				isOpen={isVerifyEmailModalOpen}
				setIsOpen={setVerifyEmailModalOpen}
				email={emailToVerify}
			/>

			<div className="flex flex-col min-h-screen w-screen items-center justify-center bg-background gap-8 p-4 sm:p-0 ">
				<div className="flex flex-col items-center gap-1">
					<span className="font-display text-4xl sm:text-5xl tracking-[0.08em] text-primary">SiPher</span>
					<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase w-full">Silent Whisper</span>
				</div>
				<Card className="relative w-full max-w-md bg-card text-card-foreground p-6 sm:p-8 rounded-lg shadow-2xl border-border">
					<div className="absolute top-4 left-4">
						<Button disabled={type === "orgInvite"} variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => router.back()}>
							<ArrowLeft className="w-5 h-5" />
						</Button>
					</div>
					<div className="absolute top-4 right-4">
						<SettingsDropdown />
					</div>
					<CardHeader className="flex flex-col items-center space-y-6 pt-8 text-center">
						<CardTitle className="text-2xl font-semibold font-mono">
							{view === "signIn" && "Sign In"}
							{view === "signUp" && "Create an account"}
							{view === "forgotPassword" && "Reset Password"}
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0 overflow-hidden">
						<AnimatePresence mode="wait" initial={false}>
							<motion.div
								key={view}
								initial={{ opacity: 0, x: 50 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -50 }}
								transition={{ duration: 0.3 }}
							>
								{view === "signIn" ? (
									<SignInForm
										setView={setView}
										onEmailNotVerified={(email) => {
											setEmailToVerify(email);
											setVerifyEmailModalOpen(true);
										}}
									/>
								) : view === "signUp" ? (
									<SignUpForm
										setView={setView}
										onSuccess={(email) => {
											setEmailToVerify(email);
											setVerifyEmailModalOpen(true);
										}}
									/>
								) : (
									<ForgotPasswordForm setView={setView} />
								)}
							</motion.div>
						</AnimatePresence>
					</CardContent>
				</Card>
				<div className="flex flex-col items-center gap-1">
					<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase w-full">© 2026 Sipher. All rights reserved.</span>
					<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase w-full">
						Refuse to be dominated. Be free. <Link href="" target="_blank" className="text-primary underline">Create your own network.</Link>
					</span>
				</div>
			</div>
		</>
	);
}

export default function AuthPage() {
	return (
		<Suspense
			fallback={
				<div className="flex h-screen w-screen items-center justify-center bg-background">
					<Loader2 className="h-10 w-10 animate-spin text-primary" />
				</div>
			}
		>
			<AuthPageContent />
		</Suspense>
	);
}