import { db } from "@/lib/db";

// Load OLM via script tag to bypass bundler entirely
async function loadOlm() {
	if (typeof window === "undefined") throw new Error("OLM requires browser");
	if ((window as any).Olm) return (window as any).Olm;

	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = "/olm.js";
		script.onload = async () => {
			const Olm = (window as any).Olm;
			await Olm.init({ locateFile: () => "/olm.wasm" });
			resolve(Olm);
		};
		script.onerror = () => reject(new Error("Failed to load OLM"));
		document.head.appendChild(script);
	});
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

	await db.olmAccounts.put({
		odId,
		pickledAccount,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});

	return true;
}