import makeKeysOnSignUp from "@/app/auth/scripts/makeKeys";
import { db } from "@/lib/db";

// ============================================
// Types
// ============================================

export type SendKeysToServerFn = (args: {
	userId: string;
	identityKey: { curve25519: string; ed25519: string };
	oneTimeKeys: { keyId: string; publicKey: string }[];
	forceInsert: boolean;
}) => Promise<unknown>;

// ============================================
// Local OLM Account Management
// ============================================

/**
 * Check if user has an OLM account stored locally in IndexedDB
 * @param userId - The user's ID
 * @returns Promise resolving to true if account exists, false otherwise
 */
export async function hasLocalOlmAccount(userId: string): Promise<boolean> {
	return (await db.olmAccounts.get(userId)) !== undefined;
}

/**
 * Create a new OLM account for the user
 * @param userId - The user's ID
 * @param localPassword - Local password for encryption
 * @param sendKeysToServer - Function to send keys to the server
 * @param forceInsert - Whether to force creation even if account exists
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function createOlmAccount(
	userId: string,
	localPassword: string,
	sendKeysToServer: SendKeysToServerFn,
	forceInsert: boolean = false,
): Promise<boolean> {
	// First check if the user already has an olm account
	const existing = await db.olmAccounts.get(userId);
	if (existing && !forceInsert) return false;

	// Generate a new olm account
	return await makeKeysOnSignUp(
		userId,
		localPassword,
		sendKeysToServer,
		forceInsert ? true : false
	);
}

// ============================================
// OLM Status Management
// ============================================

/**
 * Check the synchronization status between local and server OLM accounts
 * @param userId - The user's ID
 * @param hasServerOlm - Whether the server has an OLM account for this user
 * @returns Promise resolving to the OLM status
 */
export async function checkOlmStatus(
	userId: string,
	hasServerOlm: boolean
): Promise<SiPher.OlmStatus> {
	const localOlm = await hasLocalOlmAccount(userId);

	if (localOlm && hasServerOlm) {
		return "synced";
	}

	if (!localOlm && !hasServerOlm) {
		return "not_setup";
	}

	return "mismatched";
}

/**
 * Handle OLM account creation with automatic status management
 * @param userId - The user's ID
 * @param localPassword - Local password for encryption
 * @param sendKeysToServer - Function to send keys to the server
 * @param isMismatched - Whether this is fixing a mismatched state
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function handleOlmAccountCreation(
	userId: string,
	localPassword: string,
	sendKeysToServer: SendKeysToServerFn,
	isMismatched: boolean = false
): Promise<boolean> {
	if (!userId || !localPassword.trim()) {
		return false;
	}

	try {
		const success = await createOlmAccount(
			userId,
			localPassword,
			sendKeysToServer,
			isMismatched
		);
		return success;
	} catch (error) {
		console.error("Error creating OLM account:", error);
		return false;
	}
}

