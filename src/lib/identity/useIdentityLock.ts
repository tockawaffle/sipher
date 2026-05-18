"use client";

import { useEffect, useState } from "react";
import { isKeyUnlocked, onLockChange } from "./sessionKey";

/**
 * Reactive wrapper around the module-level session key store.
 *
 * Returns `true` once `unlockSessionKey` has been called this session,
 * and `false` immediately after `clearSessionKey` (logout / tab refresh).
 * Components using this hook re-render automatically on both transitions.
 */
export function useIdentityLock(): boolean {
	const [unlocked, setUnlocked] = useState(isKeyUnlocked);

	useEffect(() => {
		// Sync with any unlock that happened before this component mounted
		// (e.g. createOvenIdentity auto-unlock).
		setUnlocked(isKeyUnlocked());
		return onLockChange(setUnlocked);
	}, []);

	return unlocked;
}
