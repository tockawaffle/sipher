"use client";

import { Button } from "@/components/ui/button";
import { Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface IdentityBackupProps {
	mnemonic: string;
	onConfirmed: () => void;
}

export default function IdentityBackup({ mnemonic, onConfirmed }: IdentityBackupProps) {
	const [confirmed, setConfirmed] = useState(false);

	function copyMnemonic() {
		navigator.clipboard.writeText(mnemonic).then(() => {
			toast.success("Mnemonic copied to clipboard.");
		});
	}

	const words = mnemonic.split(" ");

	return (
		<div className="px-6 py-6 space-y-5">
			<div className="flex items-center gap-3">
				<div className="flex items-center justify-center w-8 h-8 rounded bg-primary/10 border border-primary/20">
					<ShieldCheck className="w-4 h-4 text-primary" />
				</div>
				<span className="font-mono text-[10px] text-muted-foreground tracking-[0.25em] uppercase">
					Backup your recovery phrase
				</span>
			</div>

			<div className="space-y-1">
				<p className="text-sm text-muted-foreground leading-relaxed">
					This is the <span className="font-semibold text-foreground">only time</span> your recovery phrase will be shown. Write it down offline and keep it safe. It is the only way to recover your identity if you lose your master password.
				</p>
			</div>

			<div className="relative rounded border border-border bg-muted/40 p-4">
				<div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
					{words.map((word, i) => (
						<div key={i} className="flex items-center gap-1.5">
							<span className="font-mono text-[10px] text-muted-foreground/60 w-4 text-right shrink-0">
								{i + 1}.
							</span>
							<span className="font-mono text-[13px] text-foreground select-all">
								{word}
							</span>
						</div>
					))}
				</div>
				<button
					type="button"
					onClick={copyMnemonic}
					className="absolute top-2 right-2 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
					title="Copy recovery phrase"
				>
					<Copy className="w-3.5 h-3.5" />
				</button>
			</div>

			<label className="flex items-start gap-3 cursor-pointer select-none">
				<input
					type="checkbox"
					checked={confirmed}
					onChange={(e) => setConfirmed(e.target.checked)}
					className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
				/>
				<span className="font-mono text-[11px] text-muted-foreground leading-relaxed">
					I have written down my recovery phrase and stored it somewhere safe. I understand this phrase will never be shown again.
				</span>
			</label>

			<Button
				onClick={onConfirmed}
				disabled={!confirmed}
				className="w-full h-11 font-mono text-[11px] tracking-[0.2em] uppercase"
			>
				Continue
			</Button>
		</div>
	);
}
