import { useOlmContext } from "@/contexts/olm-context";
import { AlertCircle, Info, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

export default function OlmPasswordDialog({ userId }: { userId: string }) {
	const [needsPassword, setNeedsPassword] = useState(false);
	const [password, setPasswordInput] = useState("");

	const { setPassword, passwordError, clearPasswordError } = useOlmContext();

	useEffect(() => {
		// The context handles loading & decrypting the password from sessionStorage.
		// We only need to show the dialog if the context doesn't have a password.
		// This will be handled by the passwordError effect below.
		// For initial load, we check if there's encrypted data - if not, show dialog.
		const hasStoredPassword = sessionStorage.getItem(`olm_password_${userId}`);
		if (!hasStoredPassword) {
			setNeedsPassword(true);
		}
		// If there IS stored data, the context will decrypt it and load it.
		// If decryption fails or password is wrong, passwordError will be set.
	}, [userId]);

	// Show dialog when there's a password error (wrong password was entered)
	useEffect(() => {
		if (passwordError) {
			setNeedsPassword(true);
			setPasswordInput(""); // Clear the input for retry
		}
	}, [passwordError]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (password.trim()) {
			setPassword(password);
			setNeedsPassword(false);
		}
	};

	return (
		<Dialog open={needsPassword}>
			<DialogContent className="sm:max-w-[440px]" showCloseButton={false} onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
				<DialogHeader className="space-y-4">
					<div className="flex flex-col items-center text-center space-y-3">
						<div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center ring-8 ring-primary/5">
							<KeyRound className="h-7 w-7 text-primary" />
						</div>
						<div className="space-y-2">
							<DialogTitle className="text-2xl font-semibold tracking-tight">
								Encryption Password Required
							</DialogTitle>
							<DialogDescription className="text-sm text-muted-foreground max-w-sm">
								Enter your encryption password to access this conversation. This may be different from your login password.
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-6 pt-2">
					<div className="space-y-3">
						<Input
							type="password"
							placeholder="Enter your encryption password"
							className={`h-11 text-center ${passwordError ? "border-destructive focus-visible:ring-destructive" : ""}`}
							autoFocus
							value={password}
							onChange={(e) => {
								setPasswordInput(e.target.value);
								if (passwordError) clearPasswordError();
							}}
						/>
						{passwordError && (
							<div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2.5 text-destructive border border-destructive/20">
								<AlertCircle className="h-4 w-4 shrink-0" />
								<p className="text-xs leading-relaxed">
									{passwordError}
								</p>
							</div>
						)}
						<div className="space-y-2">
							<div className="flex items-center gap-2 rounded-md bg-chart-3/10 px-3 py-2.5 text-chart-3 border border-chart-3/20">
								<Info className="h-4 w-4 shrink-0" />
								<p className="text-xs leading-relaxed">
									You'll be asked to re-enter this password each time you start a new browser session.
									<br />
									When continuing, the window will be reloaded, please do not close the window or refresh the page by yourself.
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2 rounded-md bg-chart-2/10 px-3 py-2.5 text-chart-2 border border-chart-2/20">
							<ShieldCheck className="h-4 w-4 shrink-0" />
							<p className="text-xs leading-relaxed">
								Your password is encrypted before being stored in your browser's session storage using a secure key that cannot be exported.
							</p>
						</div>
					</div>

					<div className="flex gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => setNeedsPassword(false)}
							className="flex-1"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							className="flex-1"
							disabled={!password.trim()}
						>
							Continue
						</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	)
}