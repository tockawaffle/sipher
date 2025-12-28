declare global {
	declare namespace SiPher.Messages.ClientEncrypted {
		type EncryptedMessage = {
			content: string,
			iv?: string
		}
		type MessageEvent = {
			message: {
				/** Will either be a raw string or a encrypted blob, if it is a encrypted blob, the iv will be provided */
				content: string,
				iv?: string
			},
			from: SipherUser,
			recipient: MessageRecipient
		}
	}
}

export { }

