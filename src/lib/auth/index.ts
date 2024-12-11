"use server"
// lib/auth/index.ts
import {createClient} from '@/lib/supabase/server';
import {headers} from 'next/headers';

const PUBLIC_PATHS = [
	'/auth/login',
	'/auth/signup',
];

/**
 * Mostly used for getting the first user to prevent it being null
 */
export async function getAuthenticatedUser() {
	const headersList = await headers();
	const path = headersList.get("x-invoke-path") || "";
	
	// If we're on a public path, don't require authentication
	if (PUBLIC_PATHS.some(publicPath => path.startsWith(publicPath))) {
		return null;
	}
	
	const supabase = await createClient();
	
	const {data: {user: session}, error: sessionError} = await supabase.auth.getUser();
	
	if (sessionError || !session) {
		return null;
	}
	
	const {data: profile, error: profileError} = await supabase
		.from('users')
		.select('*')
		.eq('uuid', session.id)
		.single();
	
	if (profileError || !profile) {
		return null;
	}
	
	return profile
}