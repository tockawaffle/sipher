import {NextResponse} from 'next/server'
import {createClient} from "@/lib/supabase/server";

export async function POST(request: Request) {
	const {username, password, public_key} = await request.json()
	const supabase = await createClient()
	
	try {
		const domain = process.env.DOMAIN;
		
		if (!domain) {
			return NextResponse.json({
					error: "Server is misconfigured, please check env variables and try again."
				},
				{
					status: 500
				})
		} else if (!username || !password || !public_key) {
			return NextResponse.json({
				error: "Missing params"
			}, {status: 400})
		}
		
		// First create the auth user
		const {data: {user}, error: authError} = await supabase.auth.signUp({
			email: `${username}@${domain}`, // Using username as email
			password: password,
		})
		
		if (authError) throw authError
		if (!user) throw new Error('No user returned from sign up')
		
		// Then create our custom user record
		const {error: insertError} = await supabase
			.from('users')
			.insert({
				uuid: user.id,
				username: username,
				public_key
			})
		
		if (insertError) {
			// Rollback auth user if custom user creation fails
			await supabase.auth.admin.deleteUser(user.id)
			throw insertError
		}
		
		return NextResponse.json({success: true})
	} catch (error) {
		if (typeof error === "object") {
			return NextResponse.json(
				{error: JSON.stringify(error)},
				{status: 400}
			)
		}
		return NextResponse.json(
			{error: `Registration failed: ${error}`},
			{status: 400}
		)
	}
}