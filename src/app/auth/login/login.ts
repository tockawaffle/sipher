/**
 *
 * @param username - The unique username of that user. This will be checked for collision.
 * @param password - The plain-text password of the user. Supabase will try to match it.
 * @constructor
 */
export default async function Login(username: string, password: string) {
	try {
		let response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({username, password}),
		});
		
		// Simple error handling.
		// Since we mock an email on the main app to bypass Supabase's authentication method, we can just return whatever the API returns.
		// This also means this might be insecure, but oh well. Don't lose your password, I guess?
		let resData = await response.json();
		
		if (!response.ok) {
			return ({
				code: resData.code,
				message: resData.message
			});
		}
		
		return ({
			code: 200,
			message: resData.data
		});
	} catch (e) {
		return {code: 500, message: "An unknown error occurred"};
	}
}
