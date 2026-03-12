import { BetterAuthPlugin } from "better-auth";

export const federation = () => {
	return {
		id: "sipher-federation",
		schema: {
			serverRegistry: {
				fields: {
					url: {
						type: "string",
						required: true,
						unique: true,
						index: false
					},
					publicKey: {
						type: "string",
						required: true,
						unique: true,
						index: true
					},
					encryptionPublicKey: {
						type: "string",
						required: true,
						unique: true,
						index: true
					},
					lastSeen: {
						type: "date",
						required: true,
						index: true
					},
					createdAt: {
						type: "date",
						required: true,
						index: false
					},
					updatedAt: {
						type: "date",
						required: true,
						index: false
					},
					isHealthy: {
						type: "boolean",
						required: true,
						index: false
					}
				}
			},
			rotateChallengeTokens: {
				fields: {
					signingOldToken: {
						type: "string",
						required: true,
						index: false
					},
					signingNewToken: {
						type: "string",
						required: true,
						index: false
					},
					encryptionOldToken: {
						type: "string",
						required: true,
						index: false
					},
					encryptionNewToken: {
						type: "string",
						required: true,
						index: false
					},
					newSigningPublicKey: {
						type: "string",
						required: true,
						index: false
					},
					newEncryptionPublicKey: {
						type: "string",
						required: true,
						index: false
					},
					serverUrl: {
						type: "string",
						required: true,
						index: true
					},
					createdAt: {
						type: "date",
						required: true,
						index: false
					},
					attemptsLeft: {
						type: "number",
						required: true,
						index: false,
						defaultValue: 3
					},
					expiresAt: {
						type: "date",
						required: true,
						index: false
					}
				}
			},
			blacklistedServers: {
				fields: {
					serverUrl: {
						type: "string",
						required: true,
						index: true
					},
					createdAt: {
						type: "date",
						required: true,
						index: false
					},
					reason: {
						type: "string",
						required: true,
						index: false
					}
				}
			}
		}
	} satisfies BetterAuthPlugin;
}
