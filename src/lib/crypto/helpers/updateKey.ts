"use client";

import {CryptoManager} from "@/lib/crypto/keys";

export default async function UpdateKey() {
	const keyPair = await CryptoManager.generateUserKeys();
	await CryptoManager.storePrivateKey(keyPair.privateKey);
	const exportedPublic = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
	
	const req = await fetch("/api/user/send/update/key", {
		method: "POST",
		body: JSON.stringify({publicKey: exportedPublic}),
	})
	
	if (req.status !== 200) {
		await CryptoManager.deletePrivateKey();
		return {
			status: req.status,
			message: "Failed to update public key",
		}
	}
	
	return {
		status: 200,
		message: "Successfully updated keys",
	}
}