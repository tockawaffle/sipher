// hooks/useRealtime.ts
import {Dispatch, SetStateAction, useCallback, useEffect} from 'react'
import {createBrowserClient} from '@/lib/supabase/browser'
import {useUser} from '@/contexts/user'

interface UseRealtimeProps {
	setThreads: Dispatch<SetStateAction<SiPher.Thread[]>>;
}

export function useRealtime({setThreads}: UseRealtimeProps) {
	const supabase = createBrowserClient();
	const {user, updateUser} = useUser();
	
	const fetchAndUpdateThreads = useCallback(async () => {
		try {
			const response = await fetch("/api/user/get/threads");
			if (response.ok) {
				const {threads} = await response.json();
				setThreads(threads);
			}
		} catch (error) {
			console.error('Error fetching threads:', error);
		}
	}, [setThreads])
	
	useEffect(() => {
		if (!user) return;
		
		const userUpdate = supabase
			.channel("request updates")
			.on("postgres_changes", {
				event: "*",
				schema: 'public',
				table: 'users',
				filter: `uuid=eq.${user.uuid}`,
			}, async (payload) => {
				console.log(payload)
				if (payload.eventType === "UPDATE") {
					// This will also handle updates for the threads, but only for the user that accepted the request.
					// Why? Because the function that creates the thread will also update the current user request field and remove
					// the corresponding request.
					if (payload.new.requests !== payload.old.requests) {
						updateUser({
							...user,
							requests: payload.new.requests
						})
					}
				} else if (payload.eventType === "DELETE") {
					console.log(`Payload from delete: \n${payload}`)
					updateUser({
						...user,
						//@ts-expect-error
						requests: payload.new
					})
				}
			}).subscribe()
		
		const threadUpdate = supabase
			.channel("thread updates")
			.on("postgres_changes", {
				event: "*",
				schema: 'public',
				table: "thread_participants",
				filter: `user_uuid=eq.${user.uuid}`
			}, async (payload) => {
				if (payload.new !== payload.old) {
					await fetchAndUpdateThreads();
				}
			}).subscribe()
		
		return () => {
			threadUpdate.unsubscribe()
			userUpdate.unsubscribe()
		}
		
	}, [user?.uuid, fetchAndUpdateThreads, supabase, updateUser, user]);
}