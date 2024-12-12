// app/api/realtime/route.ts
import {createClient} from '@/lib/supabase/server'

export async function GET(request: Request) {
	const supabase = await createClient()
	console.log("Updated")
	// Get the current authenticated user
	const {data: {user}, error: userError} = await supabase.auth.getUser()
	
	// If any of these, return a default error.
	if (userError || !user) {
		return new Response('Unauthorized', {status: 401})
	}
	
	// Start the stream of data
	const stream = new TransformStream()
	const writer = stream.writable.getWriter()
	const encoder = new TextEncoder()
	
	// Create the channel
	let channel: ReturnType<typeof supabase.channel> | null = null
	
	try {
		// RealTime supabase!
		channel = supabase
			.channel('user-requests')
			.on(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: 'users',
					filter: `uuid=eq.${user.id}`,
				},
				async (payload) => {
					if (payload.new.requests !== payload.old.requests) {
						try {
							const data = encoder.encode(`data: ${JSON.stringify({
								type: 'requests_update',
								data: payload.new.requests
							})}\n\n`)
							await writer.write(data)
						} catch (error) {
							console.error('Error writing to stream:', error)
						}
					}
				}
			)
			.subscribe()
		
		const initialData = encoder.encode(`data: ${JSON.stringify({
			type: 'connected',
			message: 'SSE connection established'
		})}\n\n`)
		await writer.write(initialData)
		
		request.signal.addEventListener('abort', () => {
			channel?.unsubscribe()
			writer.close()
		})
		
	} catch (error) {
		console.error('Error in SSE setup:', error)
		return new Response('Error setting up SSE', {status: 500})
	}
	
	return new Response(stream.readable, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		},
	})
}