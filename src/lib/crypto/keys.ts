"use client"

/**
 * @filedoc: When creating this, I thought that using PBKDF2 would be the best choice, which it isn't since I would have
 * to share passwords between user, and to do that I would have to pass the password through the server, which would defeat
 * both PBKDF2 and E2EE methods.
 * So I went with a better approach: Using public/private keys and signing messages with the public user's key and my own
 * key
 */

/**
 * A kinda-simple CryptoManager to handle keys and encrypt/decrypt messages.
 * Uses IndexedDB to store private keys securely.
 */
export class CryptoManager {
	private static readonly DB_NAME = 'SipherKeyStore';
	private static readonly DB_VERSION = 1;
	private static readonly STORE_NAME = 'keys';
	private static readonly KEY_ID = 'private_key';
	
	/**
	 * Generates a fresh RSA key pair. Yay, new keys!
	 * @returns {Promise<CryptoKeyPair>} The generated RSA key pair.
	 */
	static async generateUserKeys(): Promise<CryptoKeyPair> {
		return await crypto.subtle.generateKey(
			{
				name: "RSA-OAEP",
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: "SHA-256",
			},
			true,
			["encrypt", "decrypt"]
		);
	}
	
	/**
	 * Stores the private key.
	 * @param {CryptoKey} privateKey - The private key to store.
	 * @returns {Promise<void>}
	 */
	static async storePrivateKey(privateKey: CryptoKey): Promise<void> {
		const exportedPrivate = await crypto.subtle.exportKey('jwk', privateKey);
		const db = await this.openDB();
		
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.STORE_NAME, 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.put(exportedPrivate, this.KEY_ID);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
			
			transaction.oncomplete = () => db.close();
		});
	}
	
	/**
	 * Deletes the private key.
	 * @param {CryptoKey} privateKey - The private key to store.
	 * @returns {Promise<void>}
	 */
	static async deletePrivateKey(): Promise<void> {
		const db = await this.openDB();
		
		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.STORE_NAME, 'readwrite');
			const store = transaction.objectStore(this.STORE_NAME);
			const request = store.delete(this.KEY_ID);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
			
			transaction.oncomplete = () => db.close();
		});
	}
	
	/**
	 * Gets the stored private key from IndexedDB. Might return `null` if nothing's there.
	 * @returns {Promise<CryptoKey | null>} The private key or `null` if not found.
	 */
	static async getPrivateKey(): Promise<CryptoKey | null> {
		try {
			const db = await this.openDB();
			
			return new Promise((resolve, reject) => {
				const transaction = db.transaction(this.STORE_NAME, 'readonly');
				const store = transaction.objectStore(this.STORE_NAME);
				const request = store.get(this.KEY_ID);
				
				request.onerror = () => reject(request.error);
				request.onsuccess = async () => {
					if (!request.result) {
						resolve(null);
						return;
					}
					
					const privateKey = await crypto.subtle.importKey(
						'jwk',
						request.result,
						{
							name: "RSA-OAEP",
							hash: "SHA-256",
						},
						true,
						["decrypt"]
					);
					resolve(privateKey);
				};
				
				transaction.oncomplete = () => db.close();
			});
		} catch (error) {
			console.error('Oops! Error retrieving private key:', error);
			return null;
		}
	}
	
	static async prepareAndSendMessage(
		message: string,
		senderPublicKey: JsonWebKey,  // Our own public key
		recipientPublicKey: JsonWebKey,
		threadId: string
	): Promise<void> {
		// Encrypt for ourselves
		const senderContent = await this.encryptMessage(message, senderPublicKey);
		
		// Encrypt for recipient
		const recipientContent = await this.encryptMessage(message, recipientPublicKey);
		
		// Send to server
		const response = await fetch('/api/user/send/message', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				threadId,
				senderContent,
				recipientContent
			})
		});
		
		if (!response.ok) {
			throw new Error('Failed to send message');
		}
		
		return await response.json();
	}
	
	static async decryptThreadMessages(messages: any[], userUuid: string): Promise<SiPher.DecryptedMessage[]> {
		try {
			// Get our private key for decryption
			const privateKey = await this.getPrivateKey();
			if (!privateKey) {
				throw new Error("No private key found for decryption");
			}
			
			// Decrypt each message
			const decryptedMessages = await Promise.all(messages.map(async (message) => {
				// Determine if we're the sender
				const isSender = message.sender_uuid === userUuid;
				
				try {
					const decryptedContent = await this.decryptMessage(message.content);
					
					return {
						id: message.id,
						content: decryptedContent,
						sender_uuid: message.sender_uuid,
						created_at: message.created_at,
						isSender
					};
				} catch (error) {
					console.error('Failed to decrypt message:', message.id, error);
					return {
						id: message.id,
						content: "Failed to decrypt message",
						sender_uuid: message.sender_uuid,
						created_at: message.created_at,
						isSender,
						error: true
					};
				}
			}));
			
			return decryptedMessages;
		} catch (error) {
			console.error('Error decrypting messages:', error);
			throw error;
		}
	}
	
	/**
	 * Encrypts a message using the recipient's public key.
	 * @param {string} message - The message you wanna encrypt.
	 * @param {JsonWebKey} recipientPublicKey - The recipient's public key in JWK format.
	 * @returns {Promise<string>} The encrypted message in base64 format.
	 */
	static async encryptMessage(message: string, recipientPublicKey: JsonWebKey): Promise<string> {
		const publicKey = await crypto.subtle.importKey(
			'jwk',
			recipientPublicKey,
			{
				name: "RSA-OAEP",
				hash: "SHA-256",  // This is important!
			},
			true,
			["encrypt"]
		);
		
		const encoder = new TextEncoder();
		const encrypted = await crypto.subtle.encrypt(
			{
				name: "RSA-OAEP"
			},
			publicKey,
			encoder.encode(message)
		);
		
		return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
	}
	
	/**
	 * Decrypts a message using your own private key.
	 * @param {string} encryptedMessage - The encrypted message (base64 format).
	 * @returns {Promise<string>} The decrypted message.
	 * @throws Will throw an error if no private key is found.
	 */
	static async decryptMessage(encryptedMessage: string): Promise<string> {
		const privateKey = await this.getPrivateKey();
		if (!privateKey) throw new Error("No private key found");
		
		const encrypted = new Uint8Array(
			atob(encryptedMessage).split('').map((char) => char.charCodeAt(0))
		);
		
		try {
			const decrypted = await crypto.subtle.decrypt(
				{
					name: "RSA-OAEP"
				},
				privateKey,
				encrypted
			);
			
			return new TextDecoder().decode(decrypted);
		} catch (e) {
			console.error(`Got an error while trying to decrypt the message: ${e}`);
			throw e;
		}
	}
	
	/**
	 * Exports the private key as both a downloadable file and text content.
	 * @param {string} filename - Name of the file to be downloaded (without extension)
	 * @returns {Promise<{text: string, file: File} | null>} Object containing the text content and File object, or null if no key exists
	 */
	static async exportPrivateKey(filename: string = 'private-key-backup'): Promise<{ text: string, file: File } | null> {
		try {
			const privateKey = await this.getPrivateKey();
			if (!privateKey) {
				throw new Error("No private key found to export");
			}
			
			// Export the private key to JWK format
			const exportedKey = await crypto.subtle.exportKey('jwk', privateKey);
			
			// Convert to formatted JSON string
			const keyString = JSON.stringify(exportedKey, null, 2);
			
			// Create file object
			const blob = new Blob([keyString], {type: 'application/json'});
			const file = new File([blob], `${filename}.json`, {type: 'application/json'});
			
			return {
				text: keyString,
				file: file
			};
			
		} catch (error) {
			console.error('Failed to export private key:', error);
			return null;
		}
	}
	
	/**
	 * Validates if a provided private key matches the stored public key.
	 * @param {JsonWebKey} privateKeyJwk - The private key in JWK format to validate
	 * @param {JsonWebKey} publicKeyJwk - The public key in JWK format to validate against
	 * @returns {Promise<boolean>} True if the keys form a valid pair, false otherwise
	 */
	static async validateKeyPair(privateKeyJwk: JsonWebKey, publicKeyJwk: JsonWebKey): Promise<boolean> {
		try {
			// Import the private key
			const privateKey = await crypto.subtle.importKey(
				'jwk',
				privateKeyJwk,
				{
					name: "RSA-OAEP",
					hash: "SHA-256",
				},
				true,
				["decrypt"]
			);
			
			// Import the public key
			const publicKey = await crypto.subtle.importKey(
				'jwk',
				publicKeyJwk,
				{
					name: "RSA-OAEP",
					hash: "SHA-256",
				},
				true,
				["encrypt"]
			);
			
			// Create a test message
			const testMessage = "KeyValidationTest_" + new Date().getTime();
			
			// Encrypt with public key
			const encoder = new TextEncoder();
			const encrypted = await crypto.subtle.encrypt(
				{
					name: "RSA-OAEP",
				},
				publicKey,
				encoder.encode(testMessage)
			);
			
			// Decrypt with private key
			const decrypted = await crypto.subtle.decrypt(
				{
					name: "RSA-OAEP",
				},
				privateKey,
				encrypted
			);
			
			// Compare the result
			const decryptedText = new TextDecoder().decode(decrypted);
			return decryptedText === testMessage;
			
		} catch (error) {
			console.error('Key validation failed:', error);
			return false;
		}
	}
	
	/**
	 * Restores a private key from a backup after validating it against a provided public key.
	 * @param {JsonWebKey} privateKeyJwk - The private key in JWK format to restore
	 * @param {JsonWebKey} publicKeyJwk - The public key in JWK format to validate against
	 * @returns {Promise<boolean>} True if restoration was successful, false otherwise
	 */
	static async restoreFromBackup(privateKeyJwk: JsonWebKey, publicKeyJwk: JsonWebKey): Promise<boolean> {
		try {
			// Validate the key pair
			const isValid = await this.validateKeyPair(privateKeyJwk, publicKeyJwk);
			
			if (!isValid) {
				throw new Error("Invalid key pair - backup key doesn't match public key");
			}
			
			// Import the private key
			const privateKey = await crypto.subtle.importKey(
				'jwk',
				privateKeyJwk,
				{
					name: "RSA-OAEP",
					hash: "SHA-256",
				},
				true,
				["decrypt"]
			);
			
			// Store the validated private key
			await this.storePrivateKey(privateKey);
			return true;
			
		} catch (error) {
			console.error('Backup restoration failed:', error);
			return false;
		}
	}
	
	/**
	 * Opens db and creates the object store if needed.
	 * @returns {Promise<IDBDatabase>} A promise that resolves to the database instance.
	 */
	private static async openDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				db.createObjectStore(this.STORE_NAME);
			};
		});
	}
}
