import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";
import {SupabaseClient} from "@supabase/supabase-js";
import {getUserByUUID} from "@/app/api/auth/get_user/route";

async function updateUserRequests(searchTerm: string, requestSuuid: string, supabase: SupabaseClient<any, "public", any>) {
	try {
		
		const {data, error} = await supabase.rpc('update_user_requests', {
			search_term: searchTerm,
			new_request: requestSuuid
		});
		
		if (error) {
			throw error;
		}
		
		return {success: true, data};
	} catch (error) {
		console.error('Error updating user requests:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		};
	}
}

export async function POST(request: Request) {
	try {
		const supabase = await createClient();
		
		const {searchTerm} = await request.json();
		
		if (!searchTerm) {
			return NextResponse.json(
				{error: "Missing required fields"},
				{status: 400}
			);
		}
		
		const {data: {user}, error: authError} = await supabase.auth.getUser();
		if (authError) throw authError;
		
		if (!user) {
			return NextResponse.json({user: null}, {status: 401});
		}
		
		const userSuuid = (await getUserByUUID(supabase, user.id)).suuid;
		
		const result = await updateUserRequests(searchTerm, userSuuid, supabase);
		
		if (!result.success) {
			return NextResponse.json(
				{error: result.error},
				{status: 500}
			);
		}
		
		return NextResponse.json({success: true});
	} catch (error) {
		return NextResponse.json(
			{error: "Failed to update requests"},
			{status: 500}
		);
	}
}