"use server"
import {CookieOptions, createServerClient} from '@supabase/ssr';

import {cookies} from 'next/headers';

export async function createClient() {
	const cookieStore = await cookies();
	
	return createServerClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll() {
					return cookieStore.getAll().map(cookie => ({
						name: cookie.name,
						value: cookie.value,
					}))
				},
				setAll(cookiesList: { name: string; value: string; options?: CookieOptions }[]) {
					try {
						cookiesList.forEach(({name, value, options}) => {
							cookieStore.set({
								name,
								value,
								...options,
								// Ensure cookies are secure in production
								secure: process.env.NODE_ENV === 'production',
								sameSite: 'lax'
							})
						})
					} catch (error) {
						console.error('Error setting cookies:', error)
					}
				}
			}
		}
	)
}