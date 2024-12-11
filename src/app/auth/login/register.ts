/**
 *
 * @param username - The unique username of that user. This will be checked for collision.
 * @param password - The plain-text password of the user. Will be encrypted later by Supabase
 * @constructor
 */
export default async function Register(username: string, password: string) {
	try {
		// Sends the request to the API
		let res = await fetch('/api/auth/register', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({username, password}), // Stringifies the JSON
		});
		
		// Default error handler, if not OK just return whatever the API returned
		if (!res.ok) {
			let data = await res.json();
			return {
				code: res.status,
				message: data.error
			}
		}
		
		// User was created, now it just needs to login on the service.
		return {
			code: 200,
			message: "User created successfully, go ahead and login."
		}
	} catch (e: any) {
		return {
			code: 500,
			message: e.error
		}
	}
}
