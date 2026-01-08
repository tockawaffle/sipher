"use client"

import { loadOlm } from "@/app/auth/scripts/makeKeys";
import { db } from "@/lib/db";
import { checkOlmStatus, getOlmAccount, handleOlmAccountCreation, SendKeysToServerFn } from "@/lib/olm";
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
	}) => Promise<Olm.Session | null>;
	createInboundSession: (senderId: string, preKeyMessage: string) => Promise<Olm.Session | null>;
	sessions: Map<string, Olm.Session>;

	// Password & setup
	password: string | null;
	showOlmModal: boolean;
	setShowOlmModal: (show: boolean) => void;
	handleCreateAccount: (password: string) => Promise<void>;
	setPassword: (password: string) => void;
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
	const [showOlmModal, setShowOlmModal] = useState(false);

	// Cache sessions in memory: recipientId -> Session
	const sessionsRef = useRef<Map<string, Olm.Session>>(new Map());
	// Track pending session creation to prevent race conditions
	const pendingSessionsRef = useRef<Map<string, Promise<Olm.Session | null>>>(new Map());
	const [, forceUpdate] = useState({});

	// Helper: Cache session in memory
	const cacheSession = useCallback((recipientId: string, session: Olm.Session) => {
		sessionsRef.current.set(recipientId, session);
		forceUpdate({});
	}, []);

	// Helper: Save session to database
	const saveSessionToDb = useCallback(async (
		recipientId: string,
		session: Olm.Session,
		sessionPassword: string
	) => {
		if (!userId) return;

		await db.olmSessions.put({
			odId: userId,
			recipientId,
			pickledSession: session.pickle(sessionPassword),
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		console.debug("[OlmContext]: Session saved to DB");
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
		setPasswordState(null);
		sessionStorage.removeItem(getPasswordStorageKey(userId));
	}, [userId, getPasswordStorageKey]);

	// Load password from sessionStorage on mount
	useEffect(() => {
		if (!userId) return;
		const stored = sessionStorage.getItem(getPasswordStorageKey(userId));
		if (stored) {
			setPasswordState(stored);
		}
	}, [userId, getPasswordStorageKey]);

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

		const loadAccount = async () => {
			try {
				console.debug("[OlmContext]: Loading OLM account...");
				const account = await getOlmAccount(userId, password);
				if (!account) {
					console.warn("[OlmContext]: No OLM account found");
					return;
				}

				setOlmAccount(account);
				console.debug("[OlmContext]: OLM account loaded successfully");
			} catch (err) {
				console.error("[OlmContext]: Failed to load OLM account:", err);
				// Password might be wrong - clear it
				clearPassword();
			}
		};

		loadAccount();
	}, [userId, password, clearPassword]);

	// Set password and store in sessionStorage
	const setPassword = useCallback((newPassword: string) => {
		if (!userId) return;

		sessionStorage.setItem(getPasswordStorageKey(userId), newPassword);
		setPasswordState(newPassword);
	}, [userId, getPasswordStorageKey]);

	// Handle OLM account creation
	const handleCreateAccount = useCallback(async (accountPassword: string): Promise<void> => {
		if (!userId || !accountPassword.trim()) return;

		setOlmStatus("creating");
		const success = await handleOlmAccountCreation(
			userId,
			accountPassword,
			sendKeysToServer,
			olmStatus === "mismatched"
		);

		if (success) {
			setOlmStatus("synced");
			setShowOlmModal(false);
			setPassword(accountPassword);
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
		}
	): Promise<Olm.Session | null> => {
		if (!validateSessionRequirements()) {
			return null;
		}

		// Check if we already have this session in memory
		if (sessionsRef.current.has(recipientId)) {
			console.debug(`[OlmContext]: Using cached session for ${recipientId}`);
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

				// Check if session exists in DB
				const existingSession = await db.olmSessions
					.where("[odId+recipientId]")
					.equals([userId!, recipientId])
					.first();

				if (existingSession) {
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
				console.debug("[OlmContext]: Creating new outbound session...");

				if (recipientOlmAccount.oneTimeKeys.length === 0) {
					throw new Error("No one-time keys available for recipient");
				}

				const otk = recipientOlmAccount.oneTimeKeys[0];
				const Olm: typeof import("@matrix-org/olm") = await loadOlm();
				const newSession: Olm.Session = new Olm.Session();

				newSession.create_outbound(
					olmAccount!,
					recipientOlmAccount.identityKey.curve25519,
					otk.publicKey
				);

				console.debug(`[OlmContext]: Created session: ${newSession.session_id()}`);

				// Save to DB
				await saveSessionToDb(recipientId, newSession, password!);

				// Consume the OTK from server
				try {
					await consumeOTK({
						userId: recipientId,
						keyId: otk.keyId,
					});
					console.debug(`[OlmContext]: Consumed OTK: ${otk.keyId}`);
				} catch (err) {
					console.error("[OlmContext]: Failed to consume OTK:", err);
				}

				// Cache it
				cacheSession(recipientId, newSession);

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
		preKeyMessage: string
	): Promise<Olm.Session | null> => {
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

			const Olm = await loadOlm();
			const newSession = new Olm.Session();

			// Create inbound session from the pre-key message
			newSession.create_inbound(olmAccount!, preKeyMessage);

			// Remove the one-time key that was used
			olmAccount!.remove_one_time_keys(newSession);

			console.debug(`[OlmContext]: Created inbound session: ${newSession.session_id()}`);

			// Save to DB
			await saveSessionToDb(senderId, newSession, password!);

			// Cache it
			cacheSession(senderId, newSession);

			return newSession;
		} catch (err) {
			console.error("[OlmContext]: Failed to create inbound session:", err);
			return null;
		}
	}, [validateSessionRequirements, olmAccount, password, saveSessionToDb, cacheSession]);

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
		password,
		showOlmModal,
		setShowOlmModal,
		handleCreateAccount,
		setPassword,
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

