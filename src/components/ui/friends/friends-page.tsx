"use client"

import { Input } from "@/components/ui/input"
import { useQuery } from "convex/react"
import * as React from "react"
import { api } from "../../../../convex/_generated/api"
import { FriendListItem, type FriendData } from "./friend-list-item"

export interface FriendsPageProps {
	friendsPage: "all" | "available"
	socketStatus: string
	emptyMessage?: string
	userId: string
}

export function FriendsPage({
	friendsPage,
	socketStatus,
	userId,
	emptyMessage = "No friends found",
}: FriendsPageProps) {
	const [friendsSearch, setFriendsSearch] = React.useState("")

	// Fetch friends directly in this component
	const friends = useQuery(
		api.auth.getFriends,
		socketStatus === "connected" ? {} : "skip"
	)

	const filteredFriends = React.useMemo(() => {
		if (!friends) return []

		let filtered = friends.filter(Boolean) as FriendData[]

		// Filter by availability
		if (friendsPage === "available") {
			filtered = filtered.filter((f: FriendData) => f.status?.status !== "offline")
		}

		// Filter by search
		if (friendsSearch) {
			const search = friendsSearch.toLowerCase()
			filtered = filtered.filter((f: FriendData) => {
				const displayName = f.displayUsername || f.username || f.name || ""
				return displayName.toLowerCase().includes(search)
			})
		}

		return filtered
	}, [friends, friendsPage, friendsSearch])

	const handleMessage = React.useCallback((friendId: string) => {
		// TODO: Open DM with friend
		console.log("Open DM with", friendId)
	}, [])

	const handleStartCall = React.useCallback((friendId: string) => {
		console.log("Start Call with", friendId)
	}, [])

	const handleVideoCall = React.useCallback((friendId: string) => {
		console.log("Start Video Call with", friendId)
	}, [])

	const handleViewProfile = React.useCallback((friendId: string) => {
		console.log("View Profile", friendId)
	}, [])

	const handleRemoveFriend = React.useCallback((friendId: string) => {
		console.log("Remove Friend", friendId)
	}, [])

	const handleBlock = React.useCallback((friendId: string) => {
		console.log("Block User", friendId)
	}, [])

	return (
		<div className="flex flex-col flex-1 overflow-hidden">
			{/* Search Input - Sticky at top */}
			<div className="flex flex-col p-4 pb-2 bg-background border-b border-border/40">
				<Input
					placeholder="Search for a friend..."
					value={friendsSearch}
					onChange={(e) => setFriendsSearch(e.target.value)}
					className="w-full"
				/>
			</div>

			{/* Scrollable Friends List */}
			<div className="flex flex-col flex-1 overflow-y-auto p-4">
				<div className="flex flex-col items-start w-full gap-2">
					<span className="text-sm text-start font-medium">
						{friendsPage === "all"
							? `All Friends • ${filteredFriends.length} of ${friends?.length || 0}`
							: `Available Friends • ${filteredFriends.length} of ${friends?.filter((f: FriendData) => f && f.status?.status !== "offline").length || 0}`
						}
					</span>
					{filteredFriends.length > 0 ? (
						filteredFriends.map((friend: FriendData) => (
							<FriendListItem
								userId={userId}
								key={friend._id}
								friend={friend}
								onMessage={handleMessage}
								onStartCall={handleStartCall}
								onVideoCall={handleVideoCall}
								onViewProfile={handleViewProfile}
								onRemoveFriend={handleRemoveFriend}
								onBlock={handleBlock}
							/>
						))
					) : (
						<div className="flex flex-col items-center justify-center w-full py-12">
							<span className="text-sm font-medium text-muted-foreground">
								{friendsSearch ? `No friends found matching "${friendsSearch}"` : emptyMessage}
							</span>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

