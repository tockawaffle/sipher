import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function GET() {
	try {
		const supabase = await createClient();
		
		const {data: {user}, error: userError} = await supabase.auth.getUser()
		
		if (userError) {
			NextResponse.json(
				{error: userError},
				{status: userError?.status}
			)
		} else if (!user) {
			NextResponse.json(
				{error: "User not found"},
				{status: 401}
			)
		}
		
		const {data, error} = await supabase.rpc(
			"get_user_threads",
			{
				user_id: user!.id
			}
		)
		
		if (error) {
			return NextResponse.json({error}, {status: 400})
		}
		
		return NextResponse.json({threads: data}, {status: 200});
		
	} catch (e) {
	}
}