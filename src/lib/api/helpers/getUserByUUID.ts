import {SupabaseClient} from "@supabase/supabase-js";

export default async function getUserByUUID(supabase: SupabaseClient<any, "public", any>, uuid: string) {
	const {data: userData, error: userError} = await supabase
		.from('users')
		.select('*')
		.eq('uuid', uuid)
		.single();
	
	if (userError) throw userError;
	return userData;
}