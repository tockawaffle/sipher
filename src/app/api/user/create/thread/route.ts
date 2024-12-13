import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import getUserByUUID from "@/lib/api/helpers/getUserByUUID";
import updateUserRequests from "@/lib/api/helpers/updateUserRequests";

export async function POST(req: Request) {
	const {participant} = await req.json();
	
	if (!participant) {
		return NextResponse.json({error: 'Participant not found'}, {status: 400});
	}
	
	const supabase = await createClient()
	
	const {data: {user}, error: userError} = await supabase.auth.getUser()
	console.log("From user: ", user?.id)
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
	
	/** First we need to check if the requested participant is in the user's request array */
	const dbUser = await getUserByUUID(supabase, user.id)

	if (!dbUser) {
		return NextResponse.json(
			{error: "User not found"},
			{status: 401}
		)
	}
	
	const requests = dbUser.requests as string[]
	
	if (!requests.includes(participant)) {
		return NextResponse.json({error: "Requested user not in requests array."}, {status: 400})
	} else if (participant === dbUser.suuid) {
		return NextResponse.json({error: "Cannot add self to a new thread"}, {status: 400})
	}
	
	/** Then we can create the thread */
	
	const {error} = await supabase.rpc('create_private_thread', {
		participant_suuid: participant
	});

	if (error) {
		return NextResponse.json({error}, {status: 500});
	}
	
	return NextResponse.json({success: true}, {status: 200});
}