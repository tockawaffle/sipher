import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";
import getUserByUUID from "@/lib/api/helpers/getUserByUUID";
import updateUserRequests from "@/lib/api/helpers/updateUserRequests";

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
		
		const getUser = await getUserByUUID(supabase, user.id)
		const userSuuid = getUser.suuid;
		
		if (userSuuid === searchTerm) {
			return NextResponse.json({success: false, hint: "Cannot send request to self"}, {status: 409});
		}
		
		const result = await updateUserRequests(searchTerm, userSuuid, supabase);
		
		if (!result.success) {
			return NextResponse.json(
				{error: result.error},
				{status: 500}
			);
		}
		
		return NextResponse.json({success: true});
	} catch (err) {
		return NextResponse.json(
			{error: `Failed to update requests: ${err}`},
			{status: 500}
		);
	}
}