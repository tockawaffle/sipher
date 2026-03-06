import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const signUpFormSchema = z.object({
	email: z.email("Please enter a valid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
	message: "Passwords don't match",
	path: ["confirmPassword"],
});

export function SignUpForm({
	setView,
	onSuccess,
}: {
	setView: (view: "signIn" | "signUp" | "forgotPassword") => void;
	onSuccess: (email: string) => void;
}) {
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);

	const form = useForm<z.infer<typeof signUpFormSchema>>({
		resolver: zodResolver(signUpFormSchema),
		defaultValues: {
			email: "",
			password: "",
			confirmPassword: "",
		},
	});

	async function onSubmit(values: z.infer<typeof signUpFormSchema>) {
		console.debug(`[SignUpForm] submitting registration for ${values.email}`);
		const { email, password, confirmPassword } = values;

		if (password !== confirmPassword) {
			form.setError("confirmPassword", { message: "Passwords don't match" });
			return;
		}

		await authClient.signUp.email({
			email,
			password,
			name: email.split("@")[0],
		}, {
			onSuccess: () => {
				console.debug(`[SignUpForm] registration successful for ${email}`);
				toast.success("Registration successful, please check your email for the verification link!");
				onSuccess(email);
				return;
			},
			onError: (error: any) => {
				console.debug(`[SignUpForm] registration failed for ${email}: ${JSON.stringify(error)}`);
				if (error.error.code === "PASSWORD_COMPROMISED") {
					toast.error("Password is compromised, please use a different password", {
						action: {
							label: "More details",
							onClick: () => {
								window.open("https://haveibeenpwned.com/Passwords", "_blank");
							},
						},
						duration: 10000,
					});
				} else {
					form.setError("root", { message: error.error.message });
					toast.error(error.error.message);
				}
				// Clean up the form
				form.reset();
				return;
			}
		})

	}

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

	return (
		<>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-xs font-semibold text-muted-foreground uppercase">Email</FormLabel>
								<FormControl>
									<Input
										placeholder="Enter your email"
										type="email"
										className="h-11 text-base bg-background border-border/50"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

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

					<Button
						type="submit"
						className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
						disabled={form.formState.isSubmitting}
					>
						{form.formState.isSubmitting ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : null}
						Create Account
					</Button>

					<div className="text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<button
							type="button"
							onClick={() => setView("signIn")}
							className="text-primary hover:underline underline-offset-4 font-semibold"
							disabled={form.formState.isSubmitting}
						>
							Sign in
						</button>
					</div>
				</form>
			</Form>
		</>
	);
}