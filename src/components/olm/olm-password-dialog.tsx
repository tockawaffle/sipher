import { useOlmContext } from "@/contexts/olm-context";
import { Info, KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

export default function OlmPasswordDialog({ userId }: { userId: string }) {
	const [needsPassword, setNeedsPassword] = useState(false);
	const [password, setPasswordInput] = useState("");
	const { setPassword } = useOlmContext();

	useEffect(() => {
		// Get the password from the session storage
		const password = sessionStorage.getItem(`olm_password_${userId}`);
		console.log("🔒 Password from session storage:", password);
		if (!password) {
			setNeedsPassword(true);
			return;
		}

		setPassword(password);
		setNeedsPassword(false);
	}, [userId]);

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
							className="h-11 text-center"
							autoFocus
							value={password}
							onChange={(e) => setPasswordInput(e.target.value)}
						/>
						<div className="space-y-2">
							<div className="flex items-center gap-2 rounded-md bg-emerald-500/10 dark:bg-emerald-400/10 px-3 py-2.5 text-emerald-700 dark:text-emerald-300 border border-emerald-200/20 dark:border-emerald-500/20">
								<ShieldCheck className="h-4 w-4 shrink-0" />
								<p className="text-xs leading-relaxed">
									Your password is stored locally and never sent to our servers.
								</p>
							</div>
							<div className="flex items-center gap-2 rounded-md bg-blue-500/10 dark:bg-blue-400/10 px-3 py-2.5 text-blue-700 dark:text-blue-300 border border-blue-200/20 dark:border-blue-500/20">
								<Info className="h-4 w-4 shrink-0" />
								<p className="text-xs leading-relaxed">
									You'll be asked to re-enter this password each time you start a new browser session.
								</p>
							</div>
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