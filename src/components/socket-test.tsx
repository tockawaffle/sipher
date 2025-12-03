"use client"

import { useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Input } from "./ui/input"

export default function SocketTest() {
	const [socket, setSocket] = useState<Socket | null>(null)
	const [isConnected, setIsConnected] = useState(false)
	const [messages, setMessages] = useState<string[]>([])
	const [inputMessage, setInputMessage] = useState("")

	useEffect(() => {
		// Initialize Socket.IO client
		const socketInstance = io()

		socketInstance.on("connect", () => {
			console.log("Connected to Socket.IO:", socketInstance.id)
			setIsConnected(true)
			setMessages(prev => [...prev, `✅ Connected: ${socketInstance.id}`])
		})

		socketInstance.on("disconnect", (reason) => {
			console.log("Disconnected:", reason)
			setIsConnected(false)
			setMessages(prev => [...prev, `❌ Disconnected: ${reason}`])
		})

		socketInstance.on("message", (data) => {
			console.log("Message received:", data)
			setMessages(prev => [...prev, `📩 Received: ${data}`])
		})

		setSocket(socketInstance)

		return () => {
			socketInstance.disconnect()
		}
	}, [])

	const sendMessage = () => {
		if (socket && inputMessage.trim()) {
			socket.emit("message", inputMessage)
			setMessages(prev => [...prev, `📤 Sent: ${inputMessage}`])
			setInputMessage("")
		}
	}

	return (
		<Card className="w-full max-w-2xl">
			<CardHeader>
				<CardTitle>Socket.IO Test Client</CardTitle>
				<CardDescription>
					Status: {isConnected ? (
						<span className="text-green-600 font-semibold">🟢 Connected</span>
					) : (
						<span className="text-red-600 font-semibold">🔴 Disconnected</span>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex gap-2">
					<Input
						type="text"
						placeholder="Enter message..."
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && sendMessage()}
						disabled={!isConnected}
					/>
					<Button onClick={sendMessage} disabled={!isConnected}>
						Send
					</Button>
				</div>

				<div className="border rounded-lg p-4 h-64 overflow-y-auto bg-muted/20">
					<div className="space-y-1 font-mono text-sm">
						{messages.length === 0 ? (
							<p className="text-muted-foreground">No messages yet...</p>
						) : (
							messages.map((msg, idx) => (
								<p key={idx} className="text-xs">{msg}</p>
							))
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	)
}

