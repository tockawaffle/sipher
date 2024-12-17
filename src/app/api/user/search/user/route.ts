import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function GET(request: Request) {
	try {
		const supabase = await createClient();
		const {searchParams} = new URL(request.url);
		const uuid = searchParams.get('uuid');
		const getDetails = searchParams.get("detailed")
		
		if (!uuid) {
			return NextResponse.json({error: "Missing UUID from request"}, {status: 400})
		} else if (uuid.length > 10) {
			return NextResponse.json({error: "UUID is not valid."}, {status: 400});
		}
		
		const {data: {user}, error: userError} = await supabase.auth.getUser()
		
		if (userError) {
			return NextResponse.json(
				{error: userError},
				{status: userError?.status}
			)
		} else if (!user) {
			return NextResponse.json(
				{error: "User not found"},
				{status: 401}
			)
		}
		
		const {data, error} = await supabase.rpc('search_users', {
			search_term: uuid
		});
		
		if (error) {
			return NextResponse.json({error: error}, {status: 500});
		}
		
		if (getDetails) {
			return NextResponse.json({user: data})
		}
		
		return NextResponse.json({exists: !!(data[0].suuid && data[0].username)}, {status: 200});
		
	} catch (error) {
		return NextResponse.json({error: error}, {status: 500});
	}
}