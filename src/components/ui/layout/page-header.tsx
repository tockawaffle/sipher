"use client"

import { Button } from "@/components/ui/button"
import { MenuIcon, PhoneIcon, SearchIcon, UserIcon, UserPlusIcon, UsersIcon, VideoIcon } from "lucide-react"
import UserCard from "../user/user-card"

export interface PageHeaderProps {
	currentChannel: SiPher.Channel | null
	page: SiPher.PageTypes
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
			isCurrentUser: boolean
		}[]
	}
	serverId?: string
	serverChannelId?: string
	onToggleMobileChannelList?: () => void
	isMobile?: boolean
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
	onToggleMobileChannelList,
	isMobile,
}: PageHeaderProps) {

	const otherParticipant = dmChannel && dmChannel.participantDetails.find((p) => !p.isCurrentUser)

	return (
		<div className="flex items-center min-h-12 md:min-h-10 max-h-12 md:max-h-10 border-b border-border/40 sticky top-0 z-10 bg-background">
			{/* Mobile: Menu toggle button */}
			{isMobile && (
				<Button
					variant="ghost"
					size="icon"
					className="h-10 w-10 shrink-0 ml-1"
					onClick={onToggleMobileChannelList}
				>
					<MenuIcon className="size-5" />
				</Button>
			)}

			{/* Desktop: SCS or DM Selector */}
			<div className="hidden md:flex justify-center items-center gap-2 max-w-72 min-w-72 border-r h-10 border-border/40">
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
			{dmChannel && otherParticipant ? (
				<div className="flex flex-row justify-start items-center gap-2 w-full px-2 md:px-4">
					<UserCard
						userName={otherParticipant.name}
						image={otherParticipant.image}
						status={otherParticipant.status}
						size="small"
					/>
					<span className="text-sm font-medium truncate">{otherParticipant.name}</span>
					<div className="flex flex-row gap-1 md:gap-2 ml-auto shrink-0">
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
							className="h-8 w-8 hidden sm:flex"
						>
							<UserIcon className="size-4" />
						</Button>
					</div>
				</div>
			) : serverChannelId ? (
				<div className="flex flex-row justify-start items-center gap-2 w-full px-2 md:px-4">
					<span className="text-sm font-medium">#{serverChannelId}</span>
				</div>
			) : page === "friends" ? (
				<div className="flex flex-row justify-start items-center gap-1 md:gap-2 w-full overflow-x-auto">
					<div className="flex flex-row gap-2 justify-start p-2 shrink-0">
						<UsersIcon className="size-4" />
						<span className="text-sm font-medium hidden sm:inline">Friends</span>
					</div>
					<span className="text-sm font-medium hidden sm:inline">•</span>
					<div className="flex flex-row gap-1 md:gap-2 h-full">
						<Button
							variant="ghost"
							disabled={friendsPage === "available"}
							className={`h-full hover:cursor-pointer justify-start px-2 md:p-2 text-xs md:text-sm ${friendsPage === "available" ? "bg-primary text-primary-foreground" : ""
								}`}
							onClick={() => onFriendsPageChange?.("available")}
						>
							<span className="hidden sm:inline">Available</span>
							<span className="sm:hidden">Online</span>
						</Button>
						<Button
							variant="ghost"
							disabled={friendsPage === "all"}
							className={`h-full hover:cursor-pointer justify-start px-2 md:p-2 text-xs md:text-sm ${friendsPage === "all" ? "bg-primary text-primary-foreground" : ""
								}`}
							onClick={() => onFriendsPageChange?.("all")}
						>
							<span className="hidden sm:inline">All Known</span>
							<span className="sm:hidden">All</span>
						</Button>
						<Button
							variant="ghost"
							className="h-full bg-primary text-primary-foreground hover:cursor-pointer justify-start px-2 md:p-2 text-xs md:text-sm"
							onClick={onAddFriend}
						>
							<UserPlusIcon className="size-4 sm:hidden" />
							<span className="hidden sm:inline">Add Friend</span>
						</Button>
					</div>
				</div>
			) : null}
		</div>
	)
}

