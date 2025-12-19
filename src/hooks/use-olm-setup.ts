"use client"

import { checkOlmStatus, handleOlmAccountCreation, SendKeysToServerFn } from "@/lib/olm";
import { useEffect, useState } from "react";

interface UseOlmSetupOptions {
	userId: string | undefined;
	hasServerOlm: boolean | undefined;
	sendKeysToServer: SendKeysToServerFn;
}

export function useOlmSetup({ userId, hasServerOlm, sendKeysToServer }: UseOlmSetupOptions) {
	const [olmStatus, setOlmStatus] = useState<SiPher.OlmStatus>("checking");
	const [showOlmModal, setShowOlmModal] = useState(false);

	// Check OLM status when user data and server status are available
	useEffect(() => {
		if (!userId || hasServerOlm === undefined) return;

		const checkStatus = async () => {
			const status = await checkOlmStatus(userId, hasServerOlm);
			setOlmStatus(status);

			if (status === "not_setup" || status === "mismatched") {
				setShowOlmModal(true);
			}
		};

		checkStatus();
	}, [userId, hasServerOlm]);

	// Handle OLM account creation
	const handleCreateAccount = async (password: string): Promise<void> => {
		if (!userId || !password.trim()) return;

		setOlmStatus("creating");
		const success = await handleOlmAccountCreation(
			userId,
			password,
			sendKeysToServer,
			olmStatus === "mismatched"
		);

		if (success) {
			setOlmStatus("synced");
			setShowOlmModal(false);
		} else {
			setOlmStatus("not_setup");
		}
	};

	return {
		olmStatus,
		showOlmModal,
		setShowOlmModal,
		handleCreateAccount
	};
}

