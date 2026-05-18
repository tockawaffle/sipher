import { getDb } from "@/lib/dexie";
import { decryptIdentity } from "@/lib/identity/sign";
import nacl from "tweetnacl";

/**
 * Session key store — module memory + sessionStorage.
 *
 * The Ed25519 keypair is held in two places:
 *   1. Module-level variables (fast path for the current execution context).
 *   2. `sessionStorage` (survives page reloads in the same tab; cleared
 *      automatically when the tab is closed or on explicit logout).
 *
 * Security notes
 * --------------
 * `sessionStorage` and module variables share the same JavaScript execution
 * context, so their XSS attack surfaces are identical — an attacker who can
 * run arbitrary script in the page can read either. Using sessionStorage does
 * NOT introduce any new attack surface over pure in-memory storage.
 *
 * What sessionStorage buys us: the key survives `window.location` navigations
 * and hard reloads within the same browser tab without the user having to
 * re-enter their master password each time. It is NOT shared across tabs
 * (unlike localStorage), and it is cleared when the tab is closed.
 *
 * `localStorage` is intentionally NOT used — it would persist across browser
 * restarts and across ALL tabs, which is an unacceptable persistence scope
 * for signing key material.
 */

const SK_PREFIX = "sipher:sk:";

let _secretKey: Uint8Array | null = null;
let _publicKey: Uint8Array | null = null;

// --- Reactivity ---------------------------------------------------------

type LockListener = (isUnlocked: boolean) => void;
const _listeners = new Set<LockListener>();

function _notify(isUnlocked: boolean) {
	for (const fn of _listeners) fn(isUnlocked);
}

/**
 * Subscribe to lock-state changes. Returns an unsubscribe function.
 * Called with `true` when the key is unlocked, `false` when cleared.
 *
 * Useful for React hooks that need to re-render when the identity
 * becomes available or is revoked (e.g. the unlock modal).
 */
export function onLockChange(fn: LockListener): () => void {
	_listeners.add(fn);
	return () => { _listeners.delete(fn); };
}

// ------------------------------------------------------------------------

/** True once `unlockSessionKey` has been called successfully this session. */
export function isKeyUnlocked(): boolean {
	return _secretKey !== null;
}

/**
 * Decrypt the identity blob from Dexie and hold the keypair in memory for
 * the rest of the session. Returns the public key so callers can confirm
 * which identity was unlocked. Throws on wrong password (GCM auth failure)
 * or missing identity record.
 */
export async function unlockSessionKey(userId: string, password: string): Promise<Uint8Array> {
	const record = await getDb().identity.get(userId);
	if (!record) throw new Error("No identity found on this device for this user.");

	const parsed = await decryptIdentity(record, password);

	// Zero any prior key before overwriting, in case of re-unlock.
	_secretKey?.fill(0);

	_secretKey = new Uint8Array(parsed.secretKey);
	_publicKey = new Uint8Array(parsed.publicKey);

	_persist(userId, _secretKey, _publicKey);
	_notify(true);
	return _publicKey;
}

/**
 * Restore the keypair from `sessionStorage` without requiring the master
 * password again. Called automatically on page load by `UnlockIdentityModal`.
 *
 * Returns `true` if the key was successfully restored, `false` if the tab is
 * fresh (no stored key) or the stored value is corrupt.
 */
export function restoreSessionKey(userId: string): boolean {
	if (typeof sessionStorage === "undefined") return false;
	try {
		const secretB64 = sessionStorage.getItem(`${SK_PREFIX}${userId}:s`);
		const publicB64 = sessionStorage.getItem(`${SK_PREFIX}${userId}:p`);
		if (!secretB64 || !publicB64) return false;

		_secretKey?.fill(0);
		_secretKey = Uint8Array.from(Buffer.from(secretB64, "base64"));
		_publicKey = Uint8Array.from(Buffer.from(publicB64, "base64"));

		_notify(true);
		return true;
	} catch {
		return false;
	}
}

/**
 * Produce a detached Ed25519 signature over `message`.
 * Throws `"Identity not unlocked"` if `unlockSessionKey` has not been called.
 */
export function sign(message: Uint8Array): Uint8Array {
	if (!_secretKey) throw new Error("Identity not unlocked. Call unlockSessionKey first.");
	return nacl.sign.detached(message, _secretKey);
}

/** Returns the cached public key, or `null` if not yet unlocked. */
export function getPublicKey(): Uint8Array | null {
	return _publicKey;
}

/**
 * Zero the in-memory secret and drop the reference. Must be called on logout
 * so the key doesn't outlive the authenticated session.
 */
export function clearSessionKey(): void {
	_secretKey?.fill(0);
	_secretKey = null;
	_publicKey = null;
	_clearStorage();
	_notify(false);
}

// --- sessionStorage helpers ---------------------------------------------

function _persist(userId: string, secret: Uint8Array, pub: Uint8Array) {
	if (typeof sessionStorage === "undefined") return;
	try {
		sessionStorage.setItem(`${SK_PREFIX}${userId}:s`, Buffer.from(secret).toString("base64"));
		sessionStorage.setItem(`${SK_PREFIX}${userId}:p`, Buffer.from(pub).toString("base64"));
		sessionStorage.setItem(`${SK_PREFIX}current`, userId);
	} catch {
		// Quota exceeded or private browsing — silently ignore; the key is
		// still available in the module-level variables for this page load.
	}
}

function _clearStorage() {
	if (typeof sessionStorage === "undefined") return;
	try {
		const userId = sessionStorage.getItem(`${SK_PREFIX}current`);
		if (userId) {
			sessionStorage.removeItem(`${SK_PREFIX}${userId}:s`);
			sessionStorage.removeItem(`${SK_PREFIX}${userId}:p`);
		}
		sessionStorage.removeItem(`${SK_PREFIX}current`);
	} catch {
		// ignore
	}
}
