import {createClient} from "@/lib/supabase/server";
import {NextResponse} from "next/server";

export async function POST(request: Request) {
	try {
		const {publicKey} = await request.json();
		const supabase = await createClient();
		
		const {error} = await supabase
			.from('users')
			.update({public_key: publicKey})
			.eq('uuid', (await supabase.auth.getUser()).data.user?.id);
		
		if (error) throw error;
		
		return NextResponse.json({success: true});
	} catch (error) {
		return NextResponse.json(
			{error: 'Failed to update public key'},
			{status: 500}
		);
	}
}