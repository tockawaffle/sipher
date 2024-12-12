"use client"
import {createBrowserClient as browserClient} from '@supabase/ssr'

export function createBrowserClient() {
	// Create a supabase client on the browser with project's credentials
	return browserClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
	)
}