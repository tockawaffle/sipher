"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { PlusIcon, SettingsIcon, UsersIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"

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
		}[]
	}
}

export function ChannelList({
	currentChannel,
	openDmChannels,
	page,
	onPageChange,
	emptyMessage = "No messages yet",
	dmChannel,
}: ChannelListProps) {
	const router = useRouter()

	return (
		<div className="flex flex-col shrink-0 max-w-72 min-w-72 border-r border-border/40">
			{/* Channel List Header */}
			<div className="flex justify-center items-center min-h-10 max-h-50 bg-background">
				<div className="flex flex-col justify-start items-start p-1 gap-2 w-full">
					<Button
						variant="ghost"
						className="w-full h-full hover:cursor-pointer justify-start"
						onClick={() => {
							onPageChange("friends")
							router.push("/")
						}}
					>
						<UsersIcon className="size-4" />
						<span className="text-sm font-medium">Friends</span>
					</Button>
					<Button
						variant="ghost"
						className="w-full h-full hover:cursor-pointer justify-start"
						onClick={() => onPageChange("support")}
					>
						<SettingsIcon className="size-4" />
						<span className="text-sm font-medium">Settings</span>
					</Button>
				</div>
			</div>

			<div className="w-[calc(100%-0.8rem)] h-px bg-border/40 mx-2" />

			{/* Channel List */}
			<div className="flex flex-col flex-1 overflow-y-auto">
				{page === "friends" || !currentChannel ? (
					<div className="flex flex-col w-full">
						<div className="flex items-center w-full justify-between p-2 select-none">
							<span className="text-xs font-semibold text-muted-foreground">
								Direct Messages
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								className="hover:cursor-pointer hover:bg-transparent!"
							>
								<PlusIcon className="size-4" />
							</Button>
						</div>
						{openDmChannels.length > 0 ? (
							openDmChannels.map((channel) => {
								const isActive = dmChannel?.id === channel.id
								const lastMessage = channel.times?.lastMessage
								const lastMessageTime = channel.times?.lastMessageAt
								if (!channel.isOpen) return null;

								return (
									<div
										key={channel.id}
										className={`flex flex-row items-center gap-3 px-2 py-1.5 mx-2 mb-0.5 rounded-md transition-all cursor-pointer group ${isActive
											? "bg-accent/60"
											: "hover:bg-accent/40"
											}`}
										onClick={() => router.push(`/channels/me/${channel.id}`)}
									>
										{/* Avatar */}
										<div className="relative shrink-0">
											<Avatar className="size-8 ring-2 ring-border">
												<AvatarImage src={channel.metadata?.icon ?? undefined} alt={channel.name} />
												<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
													{channel.name?.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<span
												className={cn(
													"absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[2.5px] border-secondary",
													channel.metadata?.icon ? "bg-muted-foreground" : "bg-muted-foreground"
												)}
											/>
										</div>

										{/* Channel Info */}
										<div className="flex flex-col justify-center flex-1 min-w-0 overflow-hidden">
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-semibold truncate text-foreground">
													{channel.name}
												</span>
												{lastMessageTime && (
													<span className="text-[10px] text-muted-foreground/70 shrink-0">
														{formatDistanceToNow(lastMessageTime, { addSuffix: false })}
													</span>
												)}
											</div>
											{lastMessage && (
												<span className="text-xs text-muted-foreground/80 truncate">
													{lastMessage.content}
												</span>
											)}
										</div>

										{/* Close button */}
										<Button
											variant="ghost"
											size="icon"
											className="size-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-background/80 transition-opacity"
											onClick={(e) => {
												e.stopPropagation()
												const isCurrentlyViewing = isActive

												db.channels.where("id").equals(channel.id).modify((channel) => {
													channel.isOpen = false;
												});

												// Navigate away if we're closing the currently viewed channel
												if (isCurrentlyViewing) {
													console.log("Navigating away from channel")
													router.push("/")
												}
											}}
											title="Close DM"
										>
											<XIcon className="size-3.5" />
										</Button>
									</div>
								)
							})
						) : (
							<div className="flex items-center min-h-10 max-h-10 p-2">
								<span className="text-xs font-medium text-muted-foreground text-center text-wrap">
									{emptyMessage}
								</span>
							</div>
						)}
					</div>
				) : (
					<div className="flex items-center min-h-10 max-h-10">
						<span className="text-sm font-medium">No channels</span>
					</div>
				)}
			</div>
		</div>
	)
}

