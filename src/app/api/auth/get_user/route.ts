import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";
import getUserByUUID from "@/lib/api/helpers/getUserByUUID";

// Helper function to get user data by UUID

export async function GET(request: Request) {
	try {
		const supabase = await createClient();
		const {searchParams} = new URL(request.url);
		const uuid = searchParams.get('uuid');
		const suuid = searchParams.get('suuid');
		const getDetails = searchParams.get("detailed")
		
		if (uuid) {
			// Get specific user by UUID
			const userData = await getUserByUUID(supabase, uuid);
			return NextResponse.json({user: userData});
		} else if (suuid) {
			const {data, error} = await supabase.rpc('search_users', {
				search_term: suuid
			});
			
			if (error) {
				return NextResponse.json({error: error}, {status: 500});
			}
			
			if (getDetails) {
				return NextResponse.json({user: data})
			}
			
			return NextResponse.json({exists: !!(data[0].suuid && data[0].username)}, {status: 200});
		} else {
			// Get current authenticated user
			const {data: {user}, error: authError} = await supabase.auth.getUser();
			if (authError) throw authError;
			
			if (!user) {
				return NextResponse.json({user: null}, {status: 401});
			}
			
			const userData = await getUserByUUID(supabase, user.id);
			return NextResponse.json({user: userData});
		}
	} catch (error) {
		if (typeof error === "object") {
			return NextResponse.json(
				{error: `Failed to fetch user: ${JSON.stringify(error)}`},
				{status: 500}
			);
		}
		
		return NextResponse.json(
			{error: `Failed to fetch user: ${error}`},
			{status: 500}
		);
	}
}