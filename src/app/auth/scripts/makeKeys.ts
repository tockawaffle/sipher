import { db } from "@/lib/db";

// Track OLM initialization state
let olmInitPromise: Promise<any> | null = null;

// Load OLM via script tag to bypass bundler entirely
export async function loadOlm() {
	if (typeof window === "undefined") throw new Error("OLM requires browser");

	// If already initialized, return cached Olm
	if ((window as any).__olmInitialized && (window as any).Olm) {
		console.debug("[makeKeysOnSignUp]: OLM already initialized");
		return (window as any).Olm;
	}

	// If initialization is in progress, wait for it
	if (olmInitPromise) {
		console.debug("[makeKeysOnSignUp]: OLM initialization in progress, waiting for it");
		return olmInitPromise;
	}

	// Start initialization
	olmInitPromise = new Promise((resolve, reject) => {
		// Check if script already loaded but not initialized
		if ((window as any).Olm) {
			const Olm = (window as any).Olm;
			Olm.init({ locateFile: () => "/olm.wasm" })
				.then(() => {
					(window as any).__olmInitialized = true;
					resolve(Olm);
				})
				.catch(reject);
			return;
		}

		const script = document.createElement("script");
		script.src = "/olm.js";
		script.onload = async () => {
			try {
				const Olm = (window as any).Olm;
				await Olm.init({ locateFile: () => "/olm.wasm" });
				(window as any).__olmInitialized = true;
				resolve(Olm);
			} catch (err) {
				reject(err);
			}
		};
		script.onerror = (err) => {
			console.error("[makeKeysOnSignUp]: Failed to load OLM: ", err);
			reject(new Error(`Failed to load OLM: ${err}`));
		};
		document.head.appendChild(script);
	});

	return olmInitPromise;
}

type SendKeysToServerFn = (args: {
	userId: string;
	identityKey: { curve25519: string; ed25519: string };
	oneTimeKeys: { keyId: string; publicKey: string }[];
	forceInsert: boolean;
}) => Promise<unknown>;

export default async function makeKeysOnSignUp(
	odId: string,
	localPassword: string,
	sendKeysToServer: SendKeysToServerFn,
	forceInsert: boolean = false,
) {
	const Olm = await loadOlm() as typeof import("@matrix-org/olm");
	const account = new Olm.Account();
	account.create();

	const identityKey: { curve25519: string; ed25519: string } = JSON.parse(account.identity_keys());
	console.debug("[makeKeysOnSignUp] Identity key: ", identityKey);

	account.generate_one_time_keys(50);
	const oneTimeKeys = JSON.parse(account.one_time_keys());
	console.debug("[makeKeysOnSignUp] One time keys: ", oneTimeKeys);

	account.mark_keys_as_published();

	try {
		await sendKeysToServer({
			userId: odId,
			identityKey: {
				curve25519: identityKey.curve25519,
				ed25519: identityKey.ed25519,
			},
			oneTimeKeys: Object.entries(oneTimeKeys.curve25519).map(([key, value]) => ({
				keyId: key,
				publicKey: value as string,
			})),
			forceInsert,
		});
	} catch (error) {
		console.error("Failed to make keys", error);
		return false;
	}

	const pickledAccount = account.pickle(localPassword);

	// Note: Password storage is handled by the OlmContext with encryption
	// Do NOT store plain text password here

	// Cache the account in window
	if (!(window as any).olmAccountCache) {
		(window as any).olmAccountCache = {};
	}
	(window as any).olmAccountCache[odId] = account;

	// Set the OLM session into the window object
	(window as any).olmSession = new Olm.Session();

	// Store the olm account on DB
	await db.olmAccounts.put({
		odId,
		pickledAccount,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});

	return true;
}