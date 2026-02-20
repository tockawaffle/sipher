/**
 * OLM Key Synchronization Utilities
 * 
 * This module provides utilities for managing OLM key synchronization
 * to handle key rotation scenarios where users change their encryption keys.
 */

import { convex } from "@/lib/providers/Convex";
import { api } from "../../../convex/_generated/api";
import { invalidateSession, validateSessionKeys } from "../db";

/**
 * Check if a recipient's keys have changed and invalidate session if needed
 * @param userId - Current user's ID
 * @param recipientId - Recipient's user ID
 * @returns True if keys are valid, false if they changed
 */
export async function checkRecipientKeyStatus(
	userId: string,
	recipientId: string
): Promise<{
	isValid: boolean;
	keyVersion?: number;
	updatedAt?: number;
	identityKey?: { curve25519: string; ed25519: string };
}> {
	try {
		// Fetch current key version from server
		const keyInfo = await convex.query(api.auth.getKeyVersion, {
			userId: recipientId
		});

		if (!keyInfo) {
			return { isValid: false };
		}

		// Validate against locally stored key metadata
		const isValid = await validateSessionKeys(
			recipientId,
			keyInfo.keyVersion,
			keyInfo.identityKey
		);

		if (!isValid) {
			console.warn(`[KeySync] Keys changed for ${recipientId}, invalidating session`);
			await invalidateSession(userId, recipientId);
		}

		return {
			isValid,
			keyVersion: keyInfo.keyVersion,
			updatedAt: keyInfo.updatedAt,
			identityKey: keyInfo.identityKey,
		};
	} catch (error) {
		console.error("[KeySync] Failed to check recipient key status:", error);
		return { isValid: false };
	}
}

/**
 * Batch check multiple recipients' key statuses
 * @param userId - Current user's ID
 * @param recipientIds - Array of recipient user IDs
 * @returns Map of recipientId to validation result
 */
export async function batchCheckRecipientKeys(
	userId: string,
	recipientIds: string[]
): Promise<Map<string, { isValid: boolean; keyVersion?: number }>> {
	const results = new Map();

	// Check all recipients in parallel
	await Promise.all(
		recipientIds.map(async (recipientId) => {
			const result = await checkRecipientKeyStatus(userId, recipientId);
			results.set(recipientId, result);
		})
	);

	return results;
}

/**
 * Create a periodic key sync checker
 * @param userId - Current user's ID
 * @param recipientIds - Array of recipient user IDs to monitor
 * @param intervalMs - Check interval in milliseconds (default: 5 minutes)
 * @param onKeyChange - Callback when keys change
 * @returns Cleanup function to stop the interval
 */
export function createPeriodicKeySync(
	userId: string,
	recipientIds: string[],
	intervalMs: number = 5 * 60 * 1000, // 5 minutes default
	onKeyChange?: (recipientId: string) => void
): () => void {
	const intervalId = setInterval(async () => {
		console.debug("[KeySync] Running periodic key check...");
		const results = await batchCheckRecipientKeys(userId, recipientIds);

		results.forEach((result, recipientId) => {
			if (!result.isValid) {
				console.warn(`[KeySync] Keys changed for ${recipientId}`);
				onKeyChange?.(recipientId);
			}
		});
	}, intervalMs);

	// Return cleanup function
	return () => clearInterval(intervalId);
}
