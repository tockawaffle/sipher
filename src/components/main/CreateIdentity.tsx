"use client";

import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Input } from "../ui/input";

const createIdentityFormSchema = z.object({
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(64, "Password cannot exceed 64 characters")
		.refine((val) => /[A-Z]/.test(val), {
			message: "Must contain at least one uppercase letter",
		})
		.refine((val) => /[a-z]/.test(val), {
			message: "Must contain at least one lowercase letter",
		})
		.refine((val) => /[0-9]/.test(val), {
			message: "Must contain at least one number",
		})
		.refine((val) => /[^a-zA-Z0-9]/.test(val), {
			message: "Must contain at least one special character",
		})
});

const requirements = [
	{ label: "8–64 characters", test: (v: string) => v.length >= 8 && v.length <= 64 },
	{ label: "Uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
	{ label: "Lowercase letter", test: (v: string) => /[a-z]/.test(v) },
	{ label: "Number", test: (v: string) => /[0-9]/.test(v) },
	{ label: "Special character", test: (v: string) => /[^a-zA-Z0-9]/.test(v) },
];

export default function CreateIdentity() {
	const [isOpen, setIsOpen] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const { data: session } = authClient.useSession();
	const router = useRouter();

	const form = useForm<z.infer<typeof createIdentityFormSchema>>({
		resolver: zodResolver(createIdentityFormSchema),
		defaultValues: {
			password: "",
		},
	});

	const password = form.watch("password");
	const passwordRequirementsMet = requirements.every((req) => req.test(password));

	async function onSubmit(values: z.infer<typeof createIdentityFormSchema>) {
		const userId = session?.user.id;
		if (!userId) return;

		try {
			const { mnemonic } = await authClient.createOvenIdentity(userId, values.password);
			console.log("[CreateIdentity]", mnemonic);
			toast.success("Identity created successfully.");
			setIsOpen(false);
			router.refresh();
		} catch (err) {
			console.error("[CreateIdentity]", err);
			toast.error("Failed to create identity. Please try again.");
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent onInteractOutside={(e) => e.preventDefault()} className="sm:max-w-md border-border bg-card p-0 overflow-hidden [&>button]:hidden">
				<div className="px-6 pt-6 pb-2 border-b border-border/60">
					<div className="flex items-center gap-3 mb-3">
						<div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 border border-primary/20">
							<KeyRound className="w-4 h-4 text-primary" />
						</div>
						<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase">
							Identity Setup
						</span>
					</div>
					<DialogHeader className="text-left space-y-1">
						<DialogTitle className="font-display text-3xl tracking-[0.06em] text-foreground">
							Create your Sipher identity
						</DialogTitle>
						<p className="text-sm text-muted-foreground leading-relaxed">
							This password encrypts your local identity key. It never leaves your device. <span className="font-bold">DO NOT FORGET THIS PASSWORD.</span>
						</p>
						<p className="text-sm text-muted-foreground leading-relaxed">
							You may use the same password for your Sipher account and your identity, although it is not recommended.
						</p>
					</DialogHeader>
				</div>

				<div className="px-6 py-5">
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
							<FormField
								control={form.control}
								name="password"
								render={({ field }) => (
									<FormItem className="space-y-1.5">
										<FormLabel className="font-mono text-[11px] tracking-[0.15em] uppercase text-muted-foreground">
											Master Password
										</FormLabel>
										<FormControl>
											<div className="relative">
												<Input
													{...field}
													type={showPassword ? "text" : "password"}
													className="h-11 text-base bg-background border-border/60 pr-10 focus-visible:ring-primary/50 focus-visible:border-primary/50"
													placeholder="••••••••••••"
												/>
												<button
													type="button"
													onClick={() => setShowPassword((v) => !v)}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
													tabIndex={-1}
												>
													{showPassword
														? <EyeOff className="w-4 h-4" />
														: <Eye className="w-4 h-4" />
													}
												</button>
											</div>
										</FormControl>
										<FormMessage className="font-mono text-[10px] tracking-wide" />
									</FormItem>
								)}
							/>

							{password.length > 0 && (
								<div className="space-y-1.5">
									<span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
										Requirements
									</span>
									<ul className="grid grid-cols-2 gap-x-4 gap-y-1">
										{requirements.map((req) => {
											const met = req.test(password);
											return (
												<li
													key={req.label}
													className={`font-mono text-[10px] tracking-wide flex items-center gap-1.5 transition-colors ${met ? "text-primary" : "text-muted-foreground/60"}`}
												>
													<span className={`inline-block w-1 h-1 rounded-full shrink-0 ${met ? "bg-primary" : "bg-border"}`} />
													{req.label}
												</li>
											);
										})}
									</ul>
								</div>
							)}

							<Accordion type="single" collapsible className="border border-destructive/30 rounded bg-destructive/5">
								<AccordionItem value="lost-password" className="border-none">
									<AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-destructive/10 rounded transition-colors">
										<span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.15em] uppercase text-destructive/80">
											<TriangleAlert className="w-3.5 h-3.5 shrink-0" />
											What if I lose my password?
										</span>
									</AccordionTrigger>
									<AccordionContent className="px-3 pb-3 pt-0">
										<ul className="space-y-1.5 font-mono text-[10px] tracking-wide text-muted-foreground leading-relaxed">
											<li className="flex gap-2">
												<span className="text-destructive/60 shrink-0">—</span>
												Your identity key is encrypted locally with this password. There is no recovery mechanism.
											</li>
											<li className="flex gap-2">
												<span className="text-destructive/60 shrink-0">—</span>
												Losing it means permanent loss of access to your encrypted messages and posts.
											</li>
											<li className="flex gap-2">
												<span className="text-destructive/60 shrink-0">—</span>
												Store it somewhere safe — a password manager or written offline.
											</li>
											<li className="flex gap-2">
												<span className="text-destructive/60 shrink-0">—</span>
												Losing your identity means that all your messages are permanently lost and your old posts won't hold a valid signature.
											</li>
										</ul>
									</AccordionContent>
								</AccordionItem>
							</Accordion>

							<Button
								type="submit"
								className="w-full h-11 font-mono text-[11px] tracking-[0.2em] uppercase"
								disabled={form.formState.isSubmitting || !passwordRequirementsMet}
							>
								{form.formState.isSubmitting
									? <Loader2 className="w-4 h-4 animate-spin" />
									: "Generate Identity"
								}
							</Button>
						</form>
					</Form>
				</div>
			</DialogContent>
		</Dialog>
	)
}