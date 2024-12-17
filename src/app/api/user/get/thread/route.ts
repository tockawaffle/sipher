import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function GET(request: Request) {
	try {
		const {searchParams} = new URL(request.url);
		const threadId = searchParams.get('threadId');
		
		if (!threadId) {
			return NextResponse.json({
				error: "No thread id provided"
			}, {status: 400})
		}
		
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
			"get_thread",
			{
				thread_uuid: threadId,
				user_id: user!.id
			}
		)
		
		if (error) {
			return NextResponse.json({error}, {status: 400})
		}
		
		return NextResponse.json({thread: data[0]}, {status: 200});
		
	} catch (e: any) {
		console.log(e)
		if (typeof e === "object") {
			return NextResponse.json({error: JSON.stringify(e)}, {status: 500})
		}
		
		return NextResponse.json({error: e}, {status: 500})
	}
}