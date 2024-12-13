// app/api/auth/login/route.ts
import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function POST(request: Request) {
	try {
		const {username, password} = await request.json()
		const supabase = await createClient()
		
		const domain = process.env.DOMAIN;
		
		if (!domain) {
			return NextResponse.json({
					error: "Server is misconfigured, please check env variables and try again."
				},
				{
					status: 500
				})
		}
		
		// Mocks the email with the domain we configured on the local env
		const email = `${username.toLowerCase()}@${domain}`
		
		// Sends the request through supabase
		const {data: {user}, error: authError} = await supabase.auth.signInWithPassword({
			email: email,
			password: password,
		})
		
		if (authError) throw authError
		
		// Fetch our custom user data
		const {data: userData, error: userError} = await supabase
			.from('users')
			.select('*, public_key')
			.eq('uuid', user?.id)
			.single()
		
		if (userError) throw userError
		
		// Returns simple data
		return NextResponse.json({user: userData})
	} catch (error) {
		return NextResponse.json(
			{error: `Login failed: ${error}`},
			{status: 401}
		)
	}
}