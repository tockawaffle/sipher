import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

export function SignInForm({
	setView,
}: {
	setView: (view: "signIn" | "signUp" | "forgotPassword") => void;
	onEmailNotVerified: (email: string) => void;
}) {
	const [showPassword, setShowPassword] = useState(false);
	const formSchema = z.object({
		email: z.email("Please enter a valid email"),
		password: z.string().min(8, "Password must be at least 8 characters"),
	})

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	})

	async function onSubmit(values: z.infer<typeof formSchema>) {
		console.debug(`[SignInForm] submitting login for ${values.email}`);
		const { email, password } = values;

		const { error } = await authClient.signIn.email({
			email,
			password,
			callbackURL: "/",
		})

		if (error) {
			form.setError("root", { message: error.message });
			toast.error(error.message);
			return;
		}

		toast.success("Login successful");
		form.reset();
		return;

	}

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
											placeholder="Enter your password"
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

					<div className="flex justify-end">
						<button
							type="button"
							onClick={() => setView("forgotPassword")}
							className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
							disabled={form.formState.isSubmitting}
						>
							Forgot password?
						</button>
					</div>

					<Button
						type="submit"
						className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
						disabled={form.formState.isSubmitting}
					>
						{form.formState.isSubmitting ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : null}
						Continue
					</Button>

					<div className="text-center text-sm text-muted-foreground text font-mono">
						Don't have an account?{" "}
						<button
							type="button"
							onClick={() => setView("signUp")}
							className="text-primary hover:underline underline-offset-4 font-semibold text-nowrap"
							disabled={form.formState.isSubmitting}
						>
							Sign up
						</button>
					</div>
				</form>
			</Form>
		</>
	)
}