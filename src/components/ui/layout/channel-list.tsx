"use client"

import { Button } from "@/components/ui/button"
import { clearUnread, db } from "@/lib/db"
import { formatDistanceToNow } from "date-fns"
import { useLiveQuery } from "dexie-react-hooks"
import { MessageSquarePlusIcon, SettingsIcon, Sparkles, UsersIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import UserCard from "../user/user-card"

export interface ChannelListProps {
	currentChannel: SiPher.Channel | null
	openDmChannels: SiPher.Channel[]
	page: "friends" | "support" | "dm" | "server"
	onPageChange: (page: "friends" | "support" | "dm" | "server") => void
	emptyMessage?: string
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
	onChannelSelect?: () => void
	isMobile?: boolean
}

export function ChannelList({
	currentChannel,
	openDmChannels,
	page,
	onPageChange,
	emptyMessage = "No messages yet",
	dmChannel,
	onChannelSelect,
	isMobile,
}: ChannelListProps) {
	const router = useRouter()

	const unreadCount = useLiveQuery(
		() => db.unreadCounts.toArray(),
		[]
	)

	const handleNavigation = (path: string) => {
		router.push(path)
		onChannelSelect?.()
	}

	return (
		<div className={`flex flex-col shrink-0 border-border/40 ${isMobile ? 'w-full h-full bg-transparent' : 'max-w-72 min-w-72 border-r bg-linear-to-b from-background to-muted/20'}`}>
			{/* Channel List Header - Navigation Items (Desktop only) */}
			{!isMobile && (
				<>
					<div className="flex flex-col p-2 gap-1">
						<Button
							variant="ghost"
							className={`w-full justify-start gap-3 h-11 px-3 rounded-lg transition-all ${page === "friends"
									? "bg-primary/10 text-primary hover:bg-primary/15 ring-1 ring-primary/20"
									: "hover:bg-accent/60"
								}`}
							onClick={() => {
								onPageChange("friends")
								handleNavigation("/")
							}}
						>
							<div className={`flex items-center justify-center w-8 h-8 rounded-lg ${page === "friends"
									? "bg-primary/20"
									: "bg-muted/50"
								}`}>
								<UsersIcon className="size-4" />
							</div>
							<span className="text-sm font-semibold">Friends</span>
						</Button>
						<Button
							variant="ghost"
							className={`w-full justify-start gap-3 h-11 px-3 rounded-lg transition-all ${page === "support"
									? "bg-primary/10 text-primary hover:bg-primary/15 ring-1 ring-primary/20"
									: "hover:bg-accent/60"
								}`}
							onClick={() => {
								onPageChange("support")
								onChannelSelect?.()
							}}
						>
							<div className={`flex items-center justify-center w-8 h-8 rounded-lg ${page === "support"
									? "bg-primary/20"
									: "bg-muted/50"
								}`}>
								<SettingsIcon className="size-4" />
							</div>
							<span className="text-sm font-semibold">Settings</span>
						</Button>
					</div>

					{/* Divider with label */}
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="h-px flex-1 bg-linear-to-r from-border/60 to-transparent" />
					</div>
				</>
			)}

			{/* Mobile Navigation Buttons */}
			{isMobile && (
				<div className="flex gap-2 px-2 py-2">
					<Button
						variant={page === "friends" ? "default" : "outline"}
						size="sm"
						className="flex-1 h-9 text-xs font-semibold"
						onClick={() => {
							onPageChange("friends")
							handleNavigation("/")
						}}
					>
						<UsersIcon className="size-3.5 mr-1.5" />
						Friends
					</Button>
					<Button
						variant={page === "support" ? "default" : "outline"}
						size="sm"
						className="flex-1 h-9 text-xs font-semibold"
						onClick={() => {
							onPageChange("support")
							onChannelSelect?.()
						}}
					>
						<SettingsIcon className="size-3.5 mr-1.5" />
						Settings
					</Button>
				</div>
			)}

			{/* Channel List */}
			<div className={`flex flex-col flex-1 overflow-y-auto ${isMobile ? 'px-2' : 'px-2'}`}>
				{page === "friends" || !currentChannel ? (
					<div className="flex flex-col w-full">
						{/* DM Header */}
						<div className="flex items-center justify-between px-1 py-2 select-none">
							<span className={`font-bold uppercase tracking-wider text-muted-foreground/70 ${isMobile ? 'text-[10px]' : 'text-[11px]'}`}>
								Direct Messages
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								className="size-6 hover:bg-accent rounded-md"
								title="New Message"
							>
								<MessageSquarePlusIcon className="size-3.5" />
							</Button>
						</div>

						{openDmChannels.length > 0 ? (
							<div className="flex flex-col gap-0.5">
								{openDmChannels.map((channel) => {
									const participantDetails = dmChannel?.participantDetails.find((p) => p.id === channel.participants[0])
									const isActive = dmChannel?.id === channel.id
									const lastMessage = channel.times?.lastMessage
									const lastMessageTime = channel.times?.lastMessageAt
									const channelUnreadCount = unreadCount?.find((unread) => unread.channelId === channel.id)?.count ?? 0
									if (!channel.isOpen) return null;

									return (
										<div
											key={channel.id}
											className={`flex flex-row items-center gap-3 px-2 py-2.5 rounded-lg transition-all cursor-pointer group ${isActive
												? "bg-accent/80 shadow-sm ring-1 ring-accent"
												: "hover:bg-accent/40 active:bg-accent/60"
												}`}
											onClick={() => {
												clearUnread(channel.id)
												console.log("Cleared unread count for channel", channel.id)
												handleNavigation(`/channels/me/${channel.id}`)
											}}
										>
											<div className="relative shrink-0">
												<UserCard
													userName={channel.name}
													image={channel.metadata?.icon ?? undefined}
													status={"none"}
												/>
												{channelUnreadCount > 0 && (
													<span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-linear-to-br from-red-500 to-red-600 text-[10px] font-bold text-white shadow-md ring-2 ring-background">
														{channelUnreadCount > 99 ? '99+' : channelUnreadCount}
													</span>
												)}
											</div>

											{/* Channel Info */}
											<div className="flex flex-col justify-center flex-1 min-w-0 overflow-hidden">
												<div className="flex items-center justify-between gap-2">
													<span className={`text-sm truncate ${isActive ? 'font-bold' : 'font-semibold'} text-foreground`}>
														{channel.name}
													</span>
													{lastMessageTime && (
														<span className="text-[10px] text-muted-foreground/60 shrink-0 font-medium">
															{formatDistanceToNow(lastMessageTime, { addSuffix: false })}
														</span>
													)}
												</div>
												{lastMessage && (
													<span className="text-xs text-muted-foreground/70 truncate mt-0.5">
														{lastMessage.content}
													</span>
												)}
											</div>

											{/* Close button - always visible on mobile, hover-visible on desktop */}
											<Button
												variant="ghost"
												size="icon"
												className={`size-7 p-0 shrink-0 hover:bg-destructive/10 hover:text-destructive rounded-md transition-all ${isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-100'}`}
												onClick={(e) => {
													e.stopPropagation()
													const isCurrentlyViewing = isActive

													db.channels.where("id").equals(channel.id).modify((channel) => {
														channel.isOpen = false;
													});

													// Navigate away if we're closing the currently viewed channel
													if (isCurrentlyViewing) {
														console.log("Navigating away from channel")
														handleNavigation("/")
													}
												}}
												title="Close DM"
											>
												<XIcon className="size-3.5" />
											</Button>
										</div>
									)
								})}
							</div>
						) : (
							<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
								<div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted/50 mb-3">
									<Sparkles className="size-5 text-muted-foreground/50" />
								</div>
								<span className="text-xs font-medium text-muted-foreground/70 leading-relaxed">
									{emptyMessage}
								</span>
							</div>
						)}
					</div>
				) : (
					<div className="flex items-center justify-center py-8">
						<span className="text-sm font-medium text-muted-foreground">No channels</span>
					</div>
				)}
			</div>
		</div>
	)
}

