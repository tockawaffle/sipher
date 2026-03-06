import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const forgotPasswordSchema = z.object({
	email: z.email("Please enter a valid email"),
});

export function ForgotPasswordForm({
	setView,
}: {
	setView: (view: "signIn" | "signUp" | "forgotPassword") => void;
}) {
	const form = useForm<z.infer<typeof forgotPasswordSchema>>({
		resolver: zodResolver(forgotPasswordSchema),
		defaultValues: {
			email: "",
		},
	});

	async function onSubmit(values: z.infer<typeof forgotPasswordSchema>) {
		console.debug(`[ForgotPasswordForm] submitting reset request for ${values.email}`);
		const { email } = values;

		return new Promise<void>((resolve) => {
			authClient.requestPasswordReset({
				email,
				redirectTo: `${window.location.origin}/auth?view=resetPassword`,
			}, {
				onSuccess: () => {
					console.debug(`[ForgotPasswordForm] reset request successful for ${email}`);
					toast.success("Reset link sent to your email");
					// Clean up the form
					form.reset();
					resolve();
				},
				onError: (error) => {
					console.debug(`[ForgotPasswordForm] reset request failed for ${email}: ${JSON.stringify(error)}`);
					form.setError("root", { message: error.error.message });
					toast.error(error.error.message);
					// Clean up the form
					form.reset();
					resolve();
				}
			})
		})
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs font-semibold text-muted-foreground uppercase">
								Email
							</FormLabel>
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

				<Button
					type="submit"
					className="w-full h-11 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90"
					disabled={form.formState.isSubmitting}
				>
					{form.formState.isSubmitting ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : null}
					Send reset link
				</Button>

				<div className="text-center text-sm text-muted-foreground">
					<button
						type="button"
						onClick={() => setView("signIn")}
						className="text-primary hover:underline underline-offset-4 font-semibold"
						disabled={form.formState.isSubmitting}
					>
						Back to Sign In
					</button>
				</div>
			</form>
		</Form>
	);
}