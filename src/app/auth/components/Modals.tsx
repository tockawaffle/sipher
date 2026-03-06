import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const verifyEmailSchema = z.object({
	token: z.string().min(1, "Token is required"),
});

export function VerifyEmailModal({
	isOpen,
	setIsOpen,
	email,
}: {
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
	email: string;
}) {
	const form = useForm<z.infer<typeof verifyEmailSchema>>({
		resolver: zodResolver(verifyEmailSchema),
		defaultValues: {
			token: "",
		},
	});

	async function onSubmit(values: z.infer<typeof verifyEmailSchema>) {
		console.debug(`[VerifyEmailModal] submitting verification for ${email}`);
		const { token } = values;

		return new Promise<void>((resolve) => {
			authClient.verifyEmail(
				{ query: { token } },
				{
					onSuccess: () => {
						toast.success("Email verified successfully! You will now be redirected to the dashboard.");
						setIsOpen(false);
						form.reset();
						resolve();
					},
					onError: (error) => {
						console.debug(`[VerifyEmailModal] verification failed for ${email}: ${JSON.stringify(error)}`);
						form.setError("token", { message: error.error.message });
						toast.error(error.error.message);
						resolve();
					},
				}
			);
		});
	}

	const handleResendVerification = () => {
		authClient.sendVerificationEmail(
			{ email },
			{
				onSuccess: () => {
					toast.success("A new verification email has been sent.");
				},
				onError: (error) => {
					toast.error(error.error.message);
				},
			}
		);
	};

	if (!isOpen) {
		return null;
	}

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Verify Your Email</DialogTitle>
					<DialogDescription>
						A verification code has been sent to{" "}
						<span className="font-semibold">{email}</span>. Please enter it
						below.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="token"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Verification Code</FormLabel>
									<FormControl>
										<Input placeholder="Enter your code" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between items-center pt-2">
							<div className="text-sm text-muted-foreground pt-2 sm:pt-0">
								<span>No code? </span>
								<button
									type="button"
									onClick={handleResendVerification}
									className="text-primary hover:underline underline-offset-4 font-semibold"
									disabled={form.formState.isSubmitting}
								>
									Resend
								</button>
							</div>
							<Button type="submit" disabled={form.formState.isSubmitting}>
								{form.formState.isSubmitting ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								Verify
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

export function ResetPasswordModal({
	isOpen,
	setIsOpen,
}: {
	isOpen: boolean;
	setIsOpen: (isOpen: boolean) => void;
}) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const token = searchParams.get("token");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	const formSchema = z.object({
		password: z.string().min(8, "Password must be at least 8 characters"),
		confirmPassword: z.string(),
	}).refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			password: "",
			confirmPassword: "",
		},
	});

	const generatePassword = () => {
		// Between 8 and 12 characters
		const length = Math.floor(Math.random() * 5) + 8;
		const lower = "abcdefghijklmnopqrstuvwxyz";
		const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		const numbers = "0123456789";
		const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

		const allChars = lower + upper + numbers + symbols;

		const getRandom = (max: number) => {
			const randomValues = new Uint32Array(1);
			window.crypto.getRandomValues(randomValues);
			return randomValues[0] % max;
		}

		let password = "";
		// Ensure at least one of each character type
		password += lower[getRandom(lower.length)];
		password += upper[getRandom(upper.length)];
		password += numbers[getRandom(numbers.length)];
		password += symbols[getRandom(symbols.length)];

		for (let i = 4; i < length; i++) {
			password += allChars[getRandom(allChars.length)];
		}

		// Fisher-Yates (aka Knuth) Shuffle
		let passwordArray = password.split('');
		for (let i = passwordArray.length - 1; i > 0; i--) {
			const j = getRandom(i + 1);
			[passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]];
		}
		const shuffledPassword = passwordArray.join('');

		form.setValue("password", shuffledPassword, { shouldValidate: true });
		form.setValue("confirmPassword", shuffledPassword, { shouldValidate: true });
		toast.info("Generated a secure password. Make sure to save it somewhere safe!", {
			action: {
				label: "Copy",
				onClick: () => {
					navigator.clipboard.writeText(shuffledPassword);
					toast.success("Password copied to clipboard", {
						closeButton: true,
					});
				},
			},
			closeButton: true,
			duration: 10000,
		});
	};

	async function onSubmit(values: z.infer<typeof formSchema>) {
		if (!token) {
			toast.error("Invalid password reset token.");
			return;
		}

		return new Promise<void>((resolve) => {
			authClient.resetPassword({
				token,
				newPassword: values.password,
			}, {
				onSuccess: () => {
					toast.success("Password has been reset successfully!");
					setIsOpen(false);
					router.replace("/auth", {
						scroll: false,
					});
					resolve();
				},
				onError: (error) => {
					toast.error(error.error.message);
					resolve();
				}
			});
		})
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => {
			setIsOpen(open);
			if (!open) {
				router.replace('/auth', {
					scroll: false,
				});
			}
		}}>
			<DialogContent className="sm:max-w-md" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Reset Password</DialogTitle>
					<DialogDescription>
						Enter your new password below. Make sure it's secure.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-xs font-semibold text-muted-foreground uppercase">Password</FormLabel>
									<FormControl>
										<div className="relative">
											<Input
												placeholder={showPassword ? "Enter your password" : "********"}
												type={showPassword ? "text" : "password"}
												className="h-11 text-base bg-background border-border/50 pr-10"
												{...field}
											/>
											<button
												type="button"
												onClick={() => setShowPassword(!showPassword)}
												className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
											>
												{showPassword ? (
													<EyeOff className="w-5 h-5" />
												) : (
													<Eye className="w-5 h-5" />
												)}
											</button>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="confirmPassword"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-xs font-semibold text-muted-foreground uppercase">Confirm Password</FormLabel>
									<FormControl>
										<div className="relative">
											<Input
												placeholder={showConfirmPassword ? "Confirm your password" : "********"}
												type={showConfirmPassword ? "text" : "password"}
												className="h-11 text-base bg-background border-border/50 pr-10"
												{...field}
											/>
											<button
												type="button"
												onClick={() =>
													setShowConfirmPassword(!showConfirmPassword)
												}
												className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
											>
												{showConfirmPassword ? (
													<EyeOff className="w-5 h-5" />
												) : (
													<Eye className="w-5 h-5" />
												)}
											</button>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="flex justify-end">
							<button
								type="button"
								onClick={generatePassword}
								className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline flex items-center gap-1"
								disabled={form.formState.isSubmitting}
							>
								<Sparkles className="w-3 h-3" />
								<span>Generate Password</span>
							</button>
						</div>
						<DialogFooter>
							<Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
								{form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Reset Password
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}