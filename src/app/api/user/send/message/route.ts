import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function POST(request: Request) {
	try {
		const {threadId, senderContent, recipientContent} = await request.json();
		const supabase = await createClient();
		
		const {data, error} = await supabase.rpc('send_message', {
			thread_uuid: threadId,
			sender_content: senderContent,
			recipient_content: recipientContent
		});
		
		if (error) throw error;
		
		return NextResponse.json({messageId: data});
	} catch (error: any) {
		if (typeof error === "object") {
			return NextResponse.json(
				{error},
				{status: 500}
			);
		}
		
		return NextResponse.json(
			{error: 'Failed to send message', details: error.message},
			{status: 500}
		);
	}
}