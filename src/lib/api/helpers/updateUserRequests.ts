import {SupabaseClient} from "@supabase/supabase-js";

export default async function updateUserRequests(searchTerm: string, requestSuuid: string, supabase: SupabaseClient<any, "public", any>) {
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