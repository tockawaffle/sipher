"use client";

import { authClient } from "@/lib/auth-client";
import { getDb } from "@/lib/dexie";
import { restoreSessionKey, unlockSessionKey } from "@/lib/identity/sessionKey";
import { useIdentityLock } from "@/lib/identity/useIdentityLock";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

/**
 * Global unlock gate shown whenever the user is authenticated, has a local
 * identity, but the in-memory session key store is cold (fresh page load,
 * navigation from another tab, etc.).
 *
 * Stays hidden for unauthenticated users and for users who have not yet
 * created an identity (those see <CreateIdentity> instead).
 */
export default function UnlockIdentityModal() {
	const { data: session, isPending: sessionLoading } = authClient.useSession();
	const isUnlocked = useIdentityLock();

	const [hasLocalIdentity, setHasLocalIdentity] = useState<boolean | null>(null);
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// On session available: first try a silent restore from sessionStorage so
	// that a page reload doesn't force a password re-entry. Only if that fails
	// do we confirm a local Dexie record exists and show the prompt.
	useEffect(() => {
		if (!session?.user.id) {
			setHasLocalIdentity(null);
			return;
		}
		// Attempt silent restore; if it works, `useIdentityLock` flips to true
		// and `shouldShow` stays false — no prompt needed.
		if (restoreSessionKey(session.user.id)) return;

		getDb().identity.get(session.user.id).then((record) => {
			setHasLocalIdentity(record !== undefined);
		});
	}, [session?.user.id]);

	// Focus the password input when the modal becomes visible.
	useEffect(() => {
		if (!isUnlocked && hasLocalIdentity) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isUnlocked, hasLocalIdentity]);

	const shouldShow =
		!sessionLoading &&
		!!session &&
		hasLocalIdentity === true &&
		!isUnlocked;

	async function handleUnlock(e: React.FormEvent) {
		e.preventDefault();
		if (!session?.user.id || !password) return;

		setLoading(true);
		setError(null);
		try {
			await unlockSessionKey(session.user.id, password);
			setPassword("");
			toast.success("Identity unlocked.");
		} catch {
			setError("Wrong password. Please try again.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Dialog open={shouldShow}>
			<DialogContent
				onInteractOutside={(e) => e.preventDefault()}
				className="sm:max-w-sm border-border bg-card p-0 overflow-hidden [&>button]:hidden"
			>
				<div className="px-6 pt-6 pb-2 border-b border-border/60">
					<div className="flex items-center gap-3 mb-3">
						<div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 border border-primary/20">
							<KeyRound className="w-4 h-4 text-primary" />
						</div>
						<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase">
							Identity locked
						</span>
					</div>
					<DialogHeader className="text-left space-y-1">
						<DialogTitle className="font-display text-2xl tracking-[0.06em] text-foreground">
							Unlock your identity
						</DialogTitle>
						<p className="text-sm text-muted-foreground leading-relaxed">
							Enter your master password to enable signing for this session.
						</p>
					</DialogHeader>
				</div>

				<form onSubmit={handleUnlock} className="px-6 py-5 space-y-4">
					<div className="space-y-1.5">
						<label className="font-mono text-[11px] tracking-[0.15em] uppercase text-muted-foreground">
							Master Password
						</label>
						<div className="relative">
							<Input
								ref={inputRef}
								type={showPassword ? "text" : "password"}
								value={password}
								onChange={(e) => { setPassword(e.target.value); setError(null); }}
								className="h-11 text-base bg-background border-border/60 pr-10 focus-visible:ring-primary/50 focus-visible:border-primary/50"
								placeholder="••••••••••••"
								disabled={loading}
							/>
							<button
								type="button"
								onClick={() => setShowPassword((v) => !v)}
								className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
								tabIndex={-1}
							>
								{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
							</button>
						</div>
						{error && (
							<p className="font-mono text-[10px] tracking-wide text-destructive">{error}</p>
						)}
					</div>

					<Button
						type="submit"
						className="w-full h-11 font-mono text-[11px] tracking-[0.2em] uppercase"
						disabled={loading || !password}
					>
						{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
