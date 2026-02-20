"use client"

import { loadOlm } from "@/app/auth/scripts/makeKeys";
import { decryptPassword, encryptPassword, getOrCreatePasswordEncryptionKey } from "@/lib/crypto";
import { db, invalidateSession, validateSessionKeys } from "@/lib/db";
import { checkOlmStatus, clearOlmAccountCache, getOlmAccount, handleOlmAccountCreation, SendKeysToServerFn } from "@/lib/olm";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// ============================================
// Types
// ============================================

interface OlmContextValue {
	// Account state
	olmAccount: Olm.Account | null;
	olmStatus: SiPher.OlmStatus;
	isReady: boolean;

	// Session management
	getSession: (recipientId: string, recipientOlmAccount: {
		identityKey: { curve25519: string; ed25519: string };
		oneTimeKeys: Array<{ keyId: string; publicKey: string }>;
		keyVersion?: number;
	}) => Promise<Olm.Session | null>;
	createInboundSession: (
		senderId: string,
		preKeyMessage: string,
		senderKeyVersion?: number,
		senderIdentityKey?: { curve25519: string; ed25519: string }
	) => Promise<Olm.Session | null>;
	sessions: Map<string, Olm.Session>;

	// Key synchronization
	validateRecipientKeys: (
		recipientId: string,
		recipientOlmAccount: {
			identityKey: { curve25519: string; ed25519: string };
			keyVersion?: number;
		}
	) => Promise<boolean>;

	// Password & setup
	password: string | null;
	passwordError: string | null;
	showOlmModal: boolean;
	setShowOlmModal: (show: boolean) => void;
	handleCreateAccount: (password: string) => Promise<void>;
	setPassword: (password: string) => void;
	clearPasswordError: () => void;
}

const OlmContext = createContext<OlmContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface OlmProviderProps {
	children: React.ReactNode;
	userId: string | undefined;
	hasServerOlm: boolean | undefined;
	sendKeysToServer: SendKeysToServerFn;
	consumeOTK: (args: { userId: string; keyId: string }) => Promise<void>;
}

export function OlmProvider({
	children,
	userId,
	hasServerOlm,
	sendKeysToServer,
	consumeOTK
}: OlmProviderProps) {
	const [olmAccount, setOlmAccount] = useState<Olm.Account | null>(null);
	const [olmStatus, setOlmStatus] = useState<SiPher.OlmStatus>("checking");
	const [password, setPasswordState] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [showOlmModal, setShowOlmModal] = useState(false);

	// Cache sessions in memory: recipientId -> Session
	const sessionsRef = useRef<Map<string, Olm.Session>>(new Map());
	// Track pending session creation to prevent race conditions
	const pendingSessionsRef = useRef<Map<string, Promise<Olm.Session | null>>>(new Map());
	// Encryption key for secure password storage (persisted in IndexedDB)
	const encryptionKeyRef = useRef<CryptoKey | null>(null);
	const [encryptionKeyReady, setEncryptionKeyReady] = useState(false);
	// Track if password was set manually (to prevent load-from-storage race condition)
	const passwordSetManuallyRef = useRef(false);
	// Track if we're currently loading the OLM account (prevent duplicate loads)
	const isLoadingAccountRef = useRef(false);
	// Trigger to force reload of OLM account
	const [reloadTrigger, setReloadTrigger] = useState(0);
	const [, forceUpdate] = useState({});

	// Initialize encryption key on mount
	useEffect(() => {
		getOrCreatePasswordEncryptionKey()
			.then((key) => {
				encryptionKeyRef.current = key;
				setEncryptionKeyReady(true);
			})
			.catch((err) => {
				console.error("[OlmContext]: Failed to initialize encryption key:", err);
			});
	}, []);

	// Helper: Cache session in memory
	const cacheSession = useCallback((recipientId: string, session: Olm.Session) => {
		sessionsRef.current.set(recipientId, session);
		forceUpdate({});
	}, []);

	// Helper: Save session to database
	const saveSessionToDb = useCallback(async (
		recipientId: string,
		session: Olm.Session,
		sessionPassword: string,
		recipientKeyVersion?: number,
		recipientIdentityKey?: { curve25519: string; ed25519: string }
	) => {
		if (!userId) return;

		await db.olmSessions.put({
			odId: userId,
			recipientId,
			pickledSession: session.pickle(sessionPassword),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			recipientKeyVersion,
			recipientIdentityKey,
		});
		console.debug("[OlmContext]: Session saved to DB with key version:", recipientKeyVersion);
	}, [userId]);

	// Helper: Unpickle session from database
	const unpickleSessionFromDb = useCallback(async (
		recipientId: string,
		pickledSession: string,
		sessionPassword: string
	): Promise<Olm.Session | null> => {
		try {
			const Olm = await loadOlm();
			const session = new Olm.Session();
			session.unpickle(sessionPassword, pickledSession);
			console.debug("[OlmContext]: Session unpickled from DB");
			return session;
		} catch (err) {
			console.warn("[OlmContext]: Failed to unpickle session:", err);
			// Delete corrupted session
			if (userId) {
				await db.olmSessions
					.where("[odId+recipientId]")
					.equals([userId, recipientId])
					.delete();
			}
			return null;
		}
	}, [userId]);

	// Helper: Validate required fields for session operations
	const validateSessionRequirements = useCallback((): boolean => {
		const requirements = [
			{ value: userId, name: 'userId' },
			{ value: olmAccount, name: 'olmAccount' },
			{ value: password, name: 'password' }
		];

		const missing = requirements.find(req => !req.value);
		if (missing) {
			console.error(`[OlmContext]: Cannot perform session operation: missing ${missing.name}`);
			return false;
		}

		return true;
	}, [userId, olmAccount, password]);

	// Helper: Get sessionStorage key for password
	const getPasswordStorageKey = useCallback((uid: string) => {
		return `olm_password_${uid}`;
	}, []);

	// Helper: Clear password from state and storage
	const clearPassword = useCallback(() => {
		if (!userId) return;
		passwordSetManuallyRef.current = false;
		setPasswordState(null);
		sessionStorage.removeItem(getPasswordStorageKey(userId));
	}, [userId, getPasswordStorageKey]);

	// Load and decrypt password from sessionStorage on mount
	useEffect(() => {
		if (!userId || !encryptionKeyReady || !encryptionKeyRef.current) return;
		// Skip if password was set manually (prevents race condition loop)
		if (passwordSetManuallyRef.current) return;

		const loadStoredPassword = async () => {
			const stored = sessionStorage.getItem(getPasswordStorageKey(userId));
			if (!stored) return;

			const decrypted = await decryptPassword(stored, encryptionKeyRef.current!);
			if (decrypted) {
				setPasswordState(decrypted);
				console.debug("[OlmContext]: Password loaded and decrypted from storage");
			} else {
				// Decryption failed - clear stale data
				sessionStorage.removeItem(getPasswordStorageKey(userId));
				console.debug("[OlmContext]: Cleared stale encrypted password");
			}
		};

		loadStoredPassword();
	}, [userId, getPasswordStorageKey, encryptionKeyReady]);

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

	// Load and unpickle the OLM account when password is available
	useEffect(() => {
		if (!userId || !password) return;
		// Prevent duplicate loads
		if (isLoadingAccountRef.current) {
			console.debug("[OlmContext]: Already loading account, skipping...");
			return;
		}

		const loadAccount = async () => {
			isLoadingAccountRef.current = true;
			try {
				const forceReload = reloadTrigger > 0;
				console.log("[OlmContext]: Loading OLM account... (trigger:", reloadTrigger, "forceReload:", forceReload, ")");

				const account = await getOlmAccount(userId, password, forceReload);
				if (!account) {
					console.warn("[OlmContext]: No OLM account found");
					isLoadingAccountRef.current = false;
					return;
				}

				setOlmAccount(account);
				setPasswordError(null);
				console.log("[OlmContext]: OLM account loaded successfully");
			} catch (err) {
				console.error("[OlmContext]: Failed to load OLM account:", err);
				// Password is wrong - clear it and set error
				setPasswordError("Incorrect encryption password. Please try again.");
				clearPassword();
			} finally {
				isLoadingAccountRef.current = false;
			}
		};

		loadAccount();
	}, [userId, password, reloadTrigger, clearPassword]);

	// Clear password error
	const clearPasswordError = useCallback(() => {
		setPasswordError(null);
	}, []);

	// Set password and store encrypted in sessionStorage
	const setPassword = useCallback((newPassword: string) => {
		if (!userId) return;

		// Mark as manually set to prevent load-from-storage race condition
		passwordSetManuallyRef.current = true;
		setPasswordError(null);
		setPasswordState(newPassword);

		// Encrypt and store asynchronously
		if (encryptionKeyRef.current) {
			encryptPassword(newPassword, encryptionKeyRef.current)
				.then((encrypted) => {
					// Only store if the password hasn't been cleared since we started
					// This prevents the race condition where clearPassword runs before this .then()
					if (passwordSetManuallyRef.current) {
						sessionStorage.setItem(getPasswordStorageKey(userId), encrypted);
						console.debug("[OlmContext]: Password encrypted and stored");
					} else {
						console.debug("[OlmContext]: Skipped storing password (was cleared)");
					}
				})
				.catch((err) => {
					console.error("[OlmContext]: Failed to encrypt password:", err);
				});
		}
	}, [userId, getPasswordStorageKey]);

	// Handle OLM account creation
	const handleCreateAccount = useCallback(async (accountPassword: string): Promise<void> => {
		if (!userId || !accountPassword.trim()) return;

		setOlmStatus("creating");
		const isRotation = olmStatus === "mismatched";

		const success = await handleOlmAccountCreation(
			userId,
			accountPassword,
			sendKeysToServer,
			isRotation
		);

		if (success) {
			setOlmStatus("synced");
			setShowOlmModal(false);
			setPassword(accountPassword);

			// Clear cache and force reload OLM account from IndexedDB after creation/rotation
			console.log("[OlmContext]: Keys", isRotation ? "rotated" : "created", "- clearing cache and reloading account");
			clearOlmAccountCache(userId);
			setReloadTrigger(prev => prev + 1);
		} else {
			setOlmStatus("not_setup");
		}
	}, [userId, olmStatus, sendKeysToServer, setPassword]);

	// Get or create an OUTBOUND session with another user (for sending messages)
	const getSession = useCallback(async (
		recipientId: string,
		recipientOlmAccount: {
			identityKey: { curve25519: string; ed25519: string };
			oneTimeKeys: Array<{ keyId: string; publicKey: string }>;
			keyVersion?: number; // Optional key version for validation
		}
	): Promise<Olm.Session | null> => {
		console.log(`[OlmContext]: getSession called for ${recipientId}`, {
			hasIdentityKey: !!recipientOlmAccount.identityKey,
			oneTimeKeysCount: recipientOlmAccount.oneTimeKeys.length,
			keyVersion: recipientOlmAccount.keyVersion
		});

		if (!validateSessionRequirements()) {
			console.error("[OlmContext]: Session requirements validation failed");
			return null;
		}

		// CRITICAL: Validate recipient's keys before using cached session
		const keyVersion = recipientOlmAccount.keyVersion || 0;
		console.log(`[OlmContext]: Validating keys for ${recipientId}, version: ${keyVersion}`);

		const isValid = await validateSessionKeys(
			recipientId,
			keyVersion,
			recipientOlmAccount.identityKey
		);

		console.log(`[OlmContext]: Key validation result for ${recipientId}: ${isValid}`);

		if (!isValid) {
			console.warn(`[OlmContext]: Recipient keys changed, invalidating session for ${recipientId}`);
			// Remove cached session
			sessionsRef.current.delete(recipientId);
			// Remove from database
			await invalidateSession(userId!, recipientId);
		}

		// Check if we already have this session in memory (after validation)
		if (sessionsRef.current.has(recipientId) && isValid) {
			console.log(`[OlmContext]: Using cached session for ${recipientId}`);
			return sessionsRef.current.get(recipientId)!;
		}

		// Check if session creation is already in progress for this recipient
		const pendingSession = pendingSessionsRef.current.get(recipientId);
		if (pendingSession) {
			console.debug(`[OlmContext]: Waiting for pending session creation for ${recipientId}`);
			return pendingSession;
		}

		// Create a new promise for this session creation
		const sessionPromise = (async () => {
			try {
				console.debug(`[OlmContext]: Loading/creating session for user ${recipientId}`);

				// Check if session exists in DB (after validation cleared invalid ones)
				const existingSession = await db.olmSessions
					.where("[odId+recipientId]")
					.equals([userId!, recipientId])
					.first();

				if (existingSession && isValid) {
					console.debug("[OlmContext]: Found existing session in DB, unpickling...");
					const session = await unpickleSessionFromDb(recipientId, existingSession.pickledSession, password!);

					if (session) {
						cacheSession(recipientId, session);
						console.debug("[OlmContext]: Session loaded from DB");
						return session;
					}
					// If unpickling failed, continue to create new session
				}

				// Create new outbound session
				console.log("[OlmContext]: Creating new outbound session...");

				if (recipientOlmAccount.oneTimeKeys.length === 0) {
					console.error("[OlmContext]: No one-time keys available for recipient");
					throw new Error("No one-time keys available for recipient");
				}

				const otk = recipientOlmAccount.oneTimeKeys[0];
				console.log(`[OlmContext]: Using OTK ${otk.keyId} for session creation`);

				const Olm: typeof import("@matrix-org/olm") = await loadOlm();
				const newSession: Olm.Session = new Olm.Session();

				console.log(`[OlmContext]: Creating outbound session with:`, {
					recipientCurve: recipientOlmAccount.identityKey.curve25519.substring(0, 20) + '...',
					otkPublicKey: otk.publicKey.substring(0, 20) + '...'
				});

				newSession.create_outbound(
					olmAccount!,
					recipientOlmAccount.identityKey.curve25519,
					otk.publicKey
				);

				console.log(`[OlmContext]: Created session: ${newSession.session_id()}`);

				// Save to DB with key version and identity key
				console.log(`[OlmContext]: Saving session to DB with keyVersion: ${keyVersion}`);
				await saveSessionToDb(
					recipientId,
					newSession,
					password!,
					keyVersion,
					recipientOlmAccount.identityKey
				);

				// Consume the OTK from server
				try {
					console.log(`[OlmContext]: Consuming OTK ${otk.keyId} from server`);
					await consumeOTK({
						userId: recipientId,
						keyId: otk.keyId,
					});
					console.log(`[OlmContext]: Successfully consumed OTK: ${otk.keyId}`);
				} catch (err) {
					console.error("[OlmContext]: Failed to consume OTK:", err);
				}

				// Cache it
				cacheSession(recipientId, newSession);
				console.log(`[OlmContext]: Session cached and ready for ${recipientId}`);

				return newSession;
			} catch (err) {
				console.error("[OlmContext]: Failed to get/create session:", err);
				return null;
			} finally {
				// Clean up pending promise
				pendingSessionsRef.current.delete(recipientId);
			}
		})();

		// Store the promise so concurrent calls can await it
		pendingSessionsRef.current.set(recipientId, sessionPromise);

		return sessionPromise;
	}, [userId, olmAccount, password, validateSessionRequirements, unpickleSessionFromDb, cacheSession, saveSessionToDb, consumeOTK]);

	// Create an INBOUND session from a received pre-key message
	const createInboundSession = useCallback(async (
		senderId: string,
		preKeyMessage: string,
		senderKeyVersion?: number,
		senderIdentityKey?: { curve25519: string; ed25519: string }
	): Promise<Olm.Session | null> => {
		console.debug("[OlmContext]: Args passed to createInboundSession", { senderId, preKeyMessage });

		if (!validateSessionRequirements()) {
			return null;
		}

		// Check if we already have a session with this sender
		if (sessionsRef.current.has(senderId)) {
			console.debug(`[OlmContext]: Session already exists for ${senderId}`);
			return sessionsRef.current.get(senderId)!;
		}

		try {
			console.debug(`[OlmContext]: Creating inbound session from sender ${senderId}`);

			const Olm: typeof import("@matrix-org/olm") = await loadOlm();
			const newSession: Olm.Session = new Olm.Session();

			// Create inbound session from the pre-key message
			newSession.create_inbound(olmAccount!, preKeyMessage);

			// Remove the one-time key that was used
			olmAccount!.remove_one_time_keys(newSession);

			console.debug(`[OlmContext]: Created inbound session: ${newSession.session_id()}`);

			// Save to DB with sender's key metadata
			await saveSessionToDb(
				senderId,
				newSession,
				password!,
				senderKeyVersion,
				senderIdentityKey
			);

			// Cache it
			cacheSession(senderId, newSession);

			return newSession;
		} catch (err) {
			console.error("[OlmContext]: Failed to create inbound session:", err);
			return null;
		}
	}, [validateSessionRequirements, olmAccount, password, saveSessionToDb, cacheSession]);

	// Validate recipient keys and invalidate session if keys have changed
	const validateRecipientKeys = useCallback(async (
		recipientId: string,
		recipientOlmAccount: {
			identityKey: { curve25519: string; ed25519: string };
			keyVersion?: number;
		}
	): Promise<boolean> => {
		if (!userId) return false;

		const keyVersion = recipientOlmAccount.keyVersion || 0;
		const isValid = await validateSessionKeys(
			recipientId,
			keyVersion,
			recipientOlmAccount.identityKey
		);

		if (!isValid) {
			console.warn(`[OlmContext]: Keys changed for ${recipientId}, invalidating session`);
			// Remove cached session
			sessionsRef.current.delete(recipientId);
			// Remove from database
			await invalidateSession(userId, recipientId);
			// Force re-render to update UI
			forceUpdate({});
		}

		return isValid;
	}, [userId]);

	const isReady = useMemo(() => {
		return olmAccount !== null && olmStatus === "synced";
	}, [olmAccount, olmStatus]);

	const contextValue: OlmContextValue = {
		olmAccount,
		olmStatus,
		isReady,
		getSession,
		createInboundSession,
		sessions: sessionsRef.current,
		validateRecipientKeys,
		password,
		passwordError,
		showOlmModal,
		setShowOlmModal,
		handleCreateAccount,
		setPassword,
		clearPasswordError,
	};

	return (
		<OlmContext.Provider value={contextValue}>
			{children}
		</OlmContext.Provider>
	);
}

// ============================================
// Hook
// ============================================

export function useOlmContext() {
	const context = useContext(OlmContext);
	if (!context) {
		throw new Error("useOlmContext must be used within an OlmProvider");
	}
	return context;
}

