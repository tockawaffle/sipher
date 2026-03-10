import forge from "node-forge";

export function encryptPayload(payload: string, recipientPublicKey: string) {
	const pub = forge.pki.publicKeyFromPem(recipientPublicKey);
	return forge.util.encode64(
		pub.encrypt(
			forge.util.encodeUtf8(payload),
			"RSA-OAEP"
		)
	)
}

export function decryptPayload(payload: string, privateKey: string) {
	const priv = forge.pki.privateKeyFromPem(privateKey);
	try {
		return forge.util.decodeUtf8(
			priv.decrypt(
				forge.util.decode64(payload),
				"RSA-OAEP"
			)
		)
	} catch (error) {
		console.error("Failed to decrypt payload", error);
		throw error;
	}
}

export function verifyChallenge(
	challenge: string,
	signedChallenge: string,
	publicKeyPem: string
): boolean {
	try {
		const pub = forge.pki.publicKeyFromPem(publicKeyPem)
		const md = forge.md.sha256.create()
		md.update(challenge, 'utf8')
		const sig = forge.util.decode64(signedChallenge)
		return pub.verify(md.digest().bytes(), sig)
	} catch {
		return false
	}
}

export function signChallenge(challenge: string, privateKeyPem: string): string {
	const priv = forge.pki.privateKeyFromPem(privateKeyPem)
	const md = forge.md.sha256.create()
	md.update(challenge, 'utf8')
	return forge.util.encode64(priv.sign(md.digest().bytes()))
}