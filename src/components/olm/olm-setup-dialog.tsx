"use client"

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useState } from "react";

interface OlmSetupDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	olmStatus: SiPher.OlmStatus;
	onCreateAccount: (password: string) => Promise<void>;
}

export default function OlmSetupDialog({
	open,
	onOpenChange,
	olmStatus,
	onCreateAccount,
}: OlmSetupDialogProps) {
	const [localPassword, setLocalPassword] = useState("");

	const handleSubmit = async () => {
		if (!localPassword.trim()) return;
		await onCreateAccount(localPassword);
		setLocalPassword(""); // Clear password after attempt
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			handleSubmit();
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={olmStatus !== "creating"}>
				<DialogHeader>
					<DialogTitle>
						{olmStatus === "not_setup" && "Set Up Encryption"}
						{olmStatus === "mismatched" && "Encryption Keys Out of Sync"}
						{olmStatus === "creating" && "Creating Encryption Keys..."}
					</DialogTitle>
					<DialogDescription>
						{olmStatus === "not_setup" && (
							"Create a local password to encrypt your messages. This password is stored locally and never sent to our servers."
						)}
						{olmStatus === "mismatched" && (
							"Your local encryption keys don't match the server. This can happen if you cleared your browser data or logged in from a new device."
						)}
					</DialogDescription>
				</DialogHeader>

				{olmStatus === "creating" ? (
					<div className="flex items-center justify-center py-6">
						<Spinner className="size-8 animate-spin" />
					</div>
				) : olmStatus === "not_setup" ? (
					<>
						<Input
							type="password"
							placeholder="Enter a local encryption password"
							value={localPassword}
							onChange={(e) => setLocalPassword(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
						<DialogFooter>
							<Button onClick={handleSubmit} disabled={!localPassword.trim()}>
								Create Encryption Keys
							</Button>
						</DialogFooter>
					</>
				) : olmStatus === "mismatched" ? (
					<>
						<div className="flex flex-col gap-2 text-sm text-muted-foreground">
							<p>You have two options:</p>
							<ul className="list-disc list-inside space-y-1">
								<li><strong>Reset:</strong> Create new keys (you'll lose access to old messages)</li>
								<li><strong>Restore:</strong> Import your backup if you have one</li>
							</ul>
						</div>
						<Input
							type="password"
							placeholder="Enter password to create new keys"
							value={localPassword}
							onChange={(e) => setLocalPassword(e.target.value)}
							onKeyDown={handleKeyDown}
						/>
						<DialogFooter className="gap-2">
							<Button variant="outline" onClick={() => onOpenChange(false)}>
								Import Keys from Backup
							</Button>
							<Button variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button onClick={handleSubmit} disabled={!localPassword.trim()}>
								Reset & Create New Keys
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

