import Bun from "bun";
import nacl from "tweetnacl";

export async function generateKeyPair() {
	const envFile = Bun.file(".env.local");
	if (!await envFile.exists()) {
		throw new Error("No .env.local file found");
	}

	const signing = nacl.sign.keyPair();
	const encryption = nacl.box.keyPair();

	const env = await envFile.text();
	if (
		env.includes("FEDERATION_PUBLIC_KEY") ||
		env.includes("FEDERATION_PRIVATE_KEY") ||
		env.includes("FEDERATION_ENCRYPTION_PUBLIC_KEY") ||
		env.includes("FEDERATION_ENCRYPTION_PRIVATE_KEY")
	) {
		throw new Error(
			"Federation keys already exist in .env.local. Delete them first if you want to regenerate.",
		);
	}

	const signingPublicKey = Buffer.from(signing.publicKey).toString("base64");
	const signingPrivateKey = Buffer.from(signing.secretKey).toString("base64");
	const encryptionPublicKey = Buffer.from(encryption.publicKey).toString("base64");
	const encryptionPrivateKey = Buffer.from(encryption.secretKey).toString("base64");

	const block = [
		"",
		"# Federation keys (Ed25519 signing + X25519 encryption)",
		`FEDERATION_PUBLIC_KEY="${signingPublicKey}"`,
		`FEDERATION_PRIVATE_KEY="${signingPrivateKey}"`,
		`FEDERATION_ENCRYPTION_PUBLIC_KEY="${encryptionPublicKey}"`,
		`FEDERATION_ENCRYPTION_PRIVATE_KEY="${encryptionPrivateKey}"`,
	].join("\n");

	await Bun.write(".env.local", env + block);
	console.log("Federation keys generated and written to .env.local");
}

generateKeyPair();
