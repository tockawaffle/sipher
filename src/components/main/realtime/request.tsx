// components/RealtimeRequests.tsx
'use client'

import {useEffect} from 'react'
import {useToast} from "@/hooks/use-toast"
import {useUser} from "@/contexts/user"
import {createBrowserClient} from "@/lib/supabase/browser";

export function RealtimeRequests() {
	const {toast} = useToast()
	const {user, updateUser} = useUser()
	
	useEffect(() => {
		if (!user) return
		
		createBrowserClient().channel("realtime requests").on("postgres_changes", {
			event: 'UPDATE',
			schema: 'public',
			table: 'users',
			filter: `uuid=eq.${user.uuid}`,
		}, async (payload) => {
			console.log(payload)
		}).subscribe()
	}, [])
	
	return null
}