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
				hash: "SHA-256",
			},
			true,
			["encrypt"]
		);
		
		const encoder = new TextEncoder();
		const encrypted = await crypto.subtle.encrypt(
			{
				name: "RSA-OAEP",
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
		
		const decrypted = await crypto.subtle.decrypt(
			{
				name: "RSA-OAEP",
			},
			privateKey,
			encrypted
		);
		
		return new TextDecoder().decode(decrypted);
	}
}
