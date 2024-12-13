// hooks/useRealtime.ts
import {useEffect} from 'react'
import {createBrowserClient} from '@/lib/supabase/browser'
import {useUser} from '@/contexts/user'
import {useToast} from '@/hooks/use-toast'

interface UseRealtimeProps {
	setThreads: React.Dispatch<React.SetStateAction<SiPher.Messages[]>>;
	threads: SiPher.Messages[]
}

export function useRealtime({setThreads}: UseRealtimeProps) {
	const supabase = createBrowserClient();
	const {user, updateUser} = useUser();
	const {toast} = useToast();
	
	const fetchAndUpdateThreads = async () => {
		try {
			const response = await fetch("/api/user/get/threads");
			if (response.ok) {
				const {threads} = await response.json();
				console.log('Setting threads:', threads);
				setThreads(threads);
			}
		} catch (error) {
			console.error('Error fetching threads:', error);
		}
	};
	
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
				}
			}).subscribe()
		
		const threadUpdate = supabase
			.channel("thread updates")
			.on("postgres_changes", {
				event: "*",
				schema: 'public',
				// Using on this one because it's easier
				table: "thread_participants",
				filter: `user_uuid=${user.uuid}`,
			}, async (payload) => {
				console.log(payload)
			}).subscribe()
	}, [user?.uuid]);
}