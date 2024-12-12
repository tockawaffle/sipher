import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";
import getUserByUUID from "@/lib/api/helpers/getUserByUUID";

// Helper function to get user data by UUID


export async function GET(request: Request) {
	try {
		const supabase = await createClient();
		const {searchParams} = new URL(request.url);
		const uuid = searchParams.get('uuid');
		
		if (uuid) {
			// Get specific user by UUID
			const userData = await getUserByUUID(supabase, uuid);
			return NextResponse.json({user: userData});
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
		return NextResponse.json(
			{error: `Failed to fetch user: ${error}`},
			{status: 500}
		);
	}
}