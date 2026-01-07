"use client"

import { Button } from "@/components/ui/button"
import { PhoneIcon, SearchIcon, UserIcon, UsersIcon, VideoIcon } from "lucide-react"
import UserCard from "../user/user-card"

export interface PageHeaderProps {
	currentChannel: SiPher.Channel | null
	page: "friends" | "support" | "dm" | "server"
	friendsPage?: "all" | "available"
	onFriendsPageChange?: (page: "all" | "available") => void
	onAddFriend?: () => void
	dmChannel?: {
		id: string
		participantDetails: {
			id: string
			name: string
			username: string
			displayUsername: string
			image: string
			status: "online" | "busy" | "offline" | "away"
		}[]
	}
	serverId?: string
	serverChannelId?: string
}

export function PageHeader({
	currentChannel,
	page,
	friendsPage,
	onFriendsPageChange,
	onAddFriend,
	dmChannel,
	serverId,
	serverChannelId,
}: PageHeaderProps) {
	return (
		<div className="flex items-center min-h-10 max-h-10 border-b border-border/40 sticky top-0 z-10 bg-background">
			{/* SCS or DM Selector */}
			<div className="flex justify-center items-center gap-2 max-w-72 min-w-72 border-r h-10 border-border/40">
				{!currentChannel || currentChannel.type === "DM" ? (
					<Button
						variant="outline"
						className="w-[calc(100%-2rem)] h-3/4 rounded-lg hover:cursor-pointer"
					>
						<SearchIcon className="size-4" />
						<span className="text-sm font-medium">Search for a Server or DM</span>
					</Button>
				) : (
					<span className="text-sm font-medium">{currentChannel.name}</span>
				)}
			</div>

			{/* Page title/options */}
			{dmChannel ? (
				<div className="flex flex-row justify-start items-center gap-2 w-full px-4">
					<UserCard
						userName={dmChannel.participantDetails[0].name}
						image={dmChannel.participantDetails[0].image}
						status={dmChannel.participantDetails[0].status}
						size="small"
					/>
					<span className="text-sm font-medium">{dmChannel.participantDetails[0].name}</span>
					<div className="flex flex-row gap-2 ml-auto">
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
						>
							<PhoneIcon className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
						>
							<VideoIcon className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
						>
							<UserIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : serverChannelId ? (
				<div className="flex flex-row justify-start items-center gap-2 w-full px-4">
					<span className="text-sm font-medium">#{serverChannelId}</span>
				</div>
			) : page === "friends" ? (
				<div className="flex flex-row justify-start items-center gap-2 w-full">
					<div className="flex flex-row gap-2 justify-start p-2">
						<UsersIcon className="size-4" />
						<span className="text-sm font-medium">Friends</span>
					</div>
					<span className="text-sm font-medium">•</span>
					<div className="flex flex-row gap-2 h-full">
						<Button
							variant="ghost"
							disabled={friendsPage === "available"}
							className={`h-full hover:cursor-pointer justify-start p-2 ${friendsPage === "available" ? "bg-primary text-primary-foreground" : ""
								}`}
							onClick={() => onFriendsPageChange?.("available")}
						>
							Available
						</Button>
						<Button
							variant="ghost"
							disabled={friendsPage === "all"}
							className={`h-full hover:cursor-pointer justify-start p-2 ${friendsPage === "all" ? "bg-primary text-primary-foreground" : ""
								}`}
							onClick={() => onFriendsPageChange?.("all")}
						>
							All Known
						</Button>
						<Button
							variant="ghost"
							className="h-full bg-primary text-primary-foreground hover:cursor-pointer justify-start p-2"
							onClick={onAddFriend}
						>
							Add Friend
						</Button>
					</div>
				</div>
			) : null}
		</div>
	)
}

