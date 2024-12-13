// components/RealtimeRequests.tsx
'use client'

import {Dispatch, SetStateAction, useEffect} from 'react'
import {useToast} from "@/hooks/use-toast"
import {useUser} from "@/contexts/user"
import {createBrowserClient} from "@/lib/supabase/browser";

interface RealtimeRequests {
	setRequests: Dispatch<SetStateAction<string[]>>
}

export function RealtimeRequests(
	{
		setRequests,
	}: RealtimeRequests
) {
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
			if (payload.new.requests !== payload.old.requests) {
				try {
					setRequests(payload.new.requests)
				} catch (error) {
					console.error('Error writing to stream:', error)
				}
			}
		}).subscribe()
	}, [])
	
	return null
}