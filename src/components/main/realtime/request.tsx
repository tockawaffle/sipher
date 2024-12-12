// components/RealtimeRequests.tsx
'use client'

import {useEffect} from 'react'
import {useToast} from "@/hooks/use-toast"
import {useUser} from "@/contexts/user"

export function RealtimeRequests() {
	const {toast} = useToast()
	const {user, updateUser} = useUser()
	
	useEffect(() => {
		if (!user) return
		
		const eventSource = new EventSource('/api/user/actions/realtime/requests')
		
		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data)
				switch (data.type) {
					case 'connected':
						console.log('SSE connected:', data.message)
						break
					case 'requests_update':
						// Update the user context with new requests
						updateUser({...user, requests: data.data})
						// Show a toast notification
						toast({
							title: "New Request",
							description: "You have a new request pending",
							duration: 5000,
						})
						break
					default:
						console.log('Unknown message type:', data.type)
				}
			} catch (error) {
				console.error('Error parsing SSE message:', error)
			}
		}
		
		eventSource.onerror = (error) => {
			console.error('SSE error:', error)
			eventSource.close()
			
			// Optionally show an error toast
			toast({
				title: "Connection Error",
				description: "Failed to connect to realtime updates",
				variant: "destructive",
				duration: 5000,
			})
		}
		
		return () => {
			eventSource.close()
		}
	}, [user, updateUser, toast])
	
	return null
}