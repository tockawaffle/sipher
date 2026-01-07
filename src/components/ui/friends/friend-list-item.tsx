"use client"

import { Button } from "@/components/ui/button"
import { getOrCreateDmChannel } from "@/lib/db"
import { MessageCircleIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import UserCard from "../user/user-card"
import { FriendActionsMenu } from "./friend-actions-menu"

export interface FriendData {
	_id: string
	id: string
	name?: string | null
	username?: string | null
	displayUsername?: string | null
	image?: string | null
	friendshipCreatedAt?: number
	status?: {
		status: "online" | "busy" | "offline" | "away"
		isUserSet: boolean
	}
}

export interface FriendListItemProps {
	friend: FriendData
	onMessage?: (friendId: string) => void
	onStartCall?: (friendId: string) => void
	onVideoCall?: (friendId: string) => void
	onViewProfile?: (friendId: string) => void
	onRemoveFriend?: (friendId: string) => void
	onBlock?: (friendId: string) => void
	userId: string
}

export function FriendListItem({
	friend,
	onMessage,
	onStartCall,
	onVideoCall,
	onViewProfile,
	onRemoveFriend,
	onBlock,
	userId,
}: FriendListItemProps) {
	const router = useRouter()
	const displayName = friend.displayUsername || friend.username || friend.name
	const status = friend.status?.status || "offline"

	return (
		<div
			className="flex flex-row items-center justify-between w-full p-3 rounded-md hover:bg-accent/50 transition-colors group border border-transparent hover:border-border/40 hover:cursor-pointer"
			onClick={() => {
				// Call the db to create or get the dm channel
				getOrCreateDmChannel(userId, {
					id: friend._id,
					name: displayName ?? "",
				}).then((channel) => {
					if (channel) {
						router.push(`/channels/me/${channel.id}`)
					}
				})
			}}
		>
			{/* Left side: Avatar + Info */}
			<div className="flex flex-row items-center gap-3 flex-1 min-w-0">
				<UserCard
					userName={displayName ?? ""}
					image={friend.image ?? undefined}
					status={status}
				/>

				<div className="flex flex-col justify-center items-start overflow-hidden flex-1 min-w-0">
					<span className="text-sm font-semibold truncate w-full text-foreground">
						{displayName}
					</span>
					<span className="text-xs text-muted-foreground capitalize truncate w-full">
						{status}
					</span>
				</div>
			</div>

			{/* Right side: Actions Menu */}
			<div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
				<Button
					variant="ghost"
					size="icon-sm"
					className="size-8 hover:bg-background/80"
					onClick={() => onMessage?.(friend._id)}
					title="Message"
				>
					<MessageCircleIcon className="size-4" />
				</Button>

				<FriendActionsMenu
					friendId={friend._id}
					onStartCall={onStartCall}
					onVideoCall={onVideoCall}
					onViewProfile={onViewProfile}
					onRemoveFriend={onRemoveFriend}
					onBlock={onBlock}
				/>
			</div>
		</div>
	)
}

