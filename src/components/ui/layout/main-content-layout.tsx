"use client"

import FriendRequestModal from "@/components/home/modals/friendRequest"
import { Button } from "@/components/ui/button"
import LogoIcon from "@/components/ui/logo-icon"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { db } from "@/lib/db"
import { cn } from "@/lib/utils"
import { CompassIcon } from "@phosphor-icons/react"
import { useQuery } from "convex/react"
import { useLiveQuery } from "dexie-react-hooks"
import { Plus } from "lucide-react"
import * as React from "react"
import { useEffect, useMemo } from "react"
import { api } from "../../../../convex/_generated/api"
import { Doc } from "../../../../convex/betterAuth/_generated/dataModel"
import DMChannelContent from "../dm/DmChannelContent"
import { FriendsPage } from "../friends/friends-page"
import { Spinner } from "../spinner"
import { ChannelList } from "./channel-list"
import { PageHeader } from "./page-header"
import { SettingsPage } from "./settings-page"

export interface MainContentLayoutProps {
	socketStatus: string
	emptyChannelMessage?: string
	emptyFriendsMessage?: string
	userId: string
	routeInfo: {
		type: SiPher.PageTypes
		dmChannelId?: string
		serverId?: string
		serverChannelId?: string
	}
	userNests: Doc<"nests">[] | undefined
}

export function MainContentLayout({
	socketStatus,
	emptyChannelMessage,
	emptyFriendsMessage,
	userId,
	routeInfo,
	userNests,
}: MainContentLayoutProps) {
	const { type, dmChannelId, serverId, serverChannelId } = routeInfo
	const [page, setPage] = React.useState<SiPher.PageTypes>(type)
	const [friendsPage, setFriendsPage] = React.useState<"all" | "available">("all")
	const [friendModal, setFriendModal] = React.useState(false)
	const [currentChannel] = React.useState<SiPher.Channel | null>(null)
	const [mobileChannelListOpen, setMobileChannelListOpen] = React.useState(false)
	const isMobile = useIsMobile()

	// Use useLiveQuery to reactively fetch channels - automatically updates when DB changes
	const openDmChannels = useLiveQuery(
		() => db.channels.where("participants").equals(userId).toArray(),
		[userId]
	) ?? []

	const participantIds = openDmChannels
		.find((channel) => channel.id === dmChannelId)
		?.participants ?? []

	const getParticipantDetails: SiPher.ParticipantDetail[] | undefined = useQuery(
		api.auth.getParticipantDetails,
		participantIds.length > 0 && dmChannelId ? { participantIds } : "skip"
	)

	// Combine channel from local DB with participant details from Convex
	const dmChannel = useMemo(() => {
		if (!dmChannelId) return undefined

		const channel = openDmChannels.find((ch) => ch.id === dmChannelId)
		if (!channel || !getParticipantDetails) return undefined

		return {
			id: channel.id,
			participantDetails: getParticipantDetails.map((participant) => ({
				id: participant.id as string,
				name: participant.name,
				username: participant.username ?? "",
				displayUsername: participant.displayUsername ?? "",
				image: participant.image ?? "",
				status: participant.status,
				isCurrentUser: participant.id === userId,
			}))
		}
	}, [openDmChannels, dmChannelId, getParticipantDetails])

	// Sync page state with route props for seamless navigation
	useEffect(() => {
		setPage(type);
	}, [type]);

	// Close mobile channel list when navigating to a channel
	const handlePageChange = React.useCallback((newPage: SiPher.PageTypes) => {
		setPage(newPage);
		if (isMobile) {
			setMobileChannelListOpen(false);
		}
	}, [isMobile]);

	// Close mobile sheet when a DM channel is selected
	const handleMobileChannelSelect = React.useCallback(() => {
		if (isMobile) {
			setMobileChannelListOpen(false);
		}
	}, [isMobile]);

	const channelListContent = (
		<ChannelList
			currentChannel={currentChannel}
			openDmChannels={openDmChannels}
			page={page}
			onPageChange={handlePageChange}
			emptyMessage={emptyChannelMessage}
			dmChannel={dmChannel}
			onChannelSelect={handleMobileChannelSelect}
			isMobile={isMobile}
		/>
	);

	return (
		<>
			<div className="flex flex-col h-full">
				<PageHeader
					currentChannel={currentChannel}
					page={page}
					friendsPage={friendsPage}
					onFriendsPageChange={setFriendsPage}
					onAddFriend={() => setFriendModal(true)}
					dmChannel={dmChannel}
					serverId={serverId}
					serverChannelId={serverChannelId}
					onToggleMobileChannelList={() => setMobileChannelListOpen(true)}
					isMobile={isMobile}
				/>

				<div className="flex flex-1 overflow-hidden">
					<div className="hidden md:flex h-full">
						{channelListContent}
					</div>

					{isMobile && (
						<Sheet open={mobileChannelListOpen} onOpenChange={setMobileChannelListOpen}>
							<SheetContent side="left" className="w-[calc(100%-3rem)] max-w-[340px] p-0 [&>button]:hidden">
								<SheetHeader className="sr-only">
									<SheetTitle>Channels</SheetTitle>
									<SheetDescription>Navigate between channels and DMs</SheetDescription>
								</SheetHeader>
								<div className="flex h-full">
									<div className="flex flex-col items-center w-[72px] shrink-0 bg-muted/50 py-3 gap-2">
										<MobileServerIcon
											isActive={true}
											isHome
										>
											<LogoIcon className="size-6" />
										</MobileServerIcon>

										<div className="w-8 h-0.5 rounded-full bg-border/60 my-1" />

										<MobileServerIcon>
											<CompassIcon className="size-5" weight="fill" />
										</MobileServerIcon>

										{/* Future: Server icons will go here */}
										{/* Placeholder for servers */}

										<MobileServerIcon isAddButton>
											<Plus className="size-5" />
										</MobileServerIcon>
									</div>

									<div className="flex-1 flex flex-col bg-background min-w-0 border-l border-border/30">
										<div className="flex items-center px-4 h-12 shrink-0 border-b border-border/30">
											<span className="text-sm font-semibold text-foreground">Direct Messages</span>
										</div>

										<div className="flex-1 overflow-y-auto">
											{channelListContent}
										</div>
									</div>
								</div>
							</SheetContent>
						</Sheet>
					)}

					{/* Main Content */}
					<div className="flex flex-col flex-1 overflow-hidden">
						{page === "dm" && dmChannelId && getParticipantDetails && (
							<div className="flex flex-1 min-h-0">
								<DMChannelContent userId={userId} channelId={dmChannelId} participantDetails={getParticipantDetails} />
							</div>
						)}

						{page === "dm" && dmChannelId && !getParticipantDetails && (
							<div className="flex flex-1 min-h-0">
								<div className="flex items-center justify-center flex-1">
									<Spinner className="size-4 animate-spin" />
									<p className="text-sm text-muted-foreground">Loading...</p>
								</div>
							</div>
						)}

						{page === "server" && serverChannelId && (
							<div className="p-4">
								<p className="text-sm text-muted-foreground">Server channel {serverChannelId}</p>
							</div>
						)}

						{page === "friends" && (
							<FriendsPage
								userId={userId}
								friendsPage={friendsPage}
								socketStatus={socketStatus}
								emptyMessage={emptyFriendsMessage}
							/>
						)}

						{page === "nests" && (
							<div className="p-4">
								<p className="text-sm text-muted-foreground">Nests</p>
							</div>
						)}

						{page === "discover" && <DiscoverPage userNests={userNests ?? []} />}

						{page === "global-nests" && <GlobalNestsPage />}

						{page === "support" && <SettingsPage />}
					</div>
				</div>
			</div>

			<FriendRequestModal
				open={friendModal}
				onOpenChange={setFriendModal}
			/>
		</>
	)
}

function GlobalNestsPage() {
	return (
		<div className="flex flex-col flex-1 overflow-hidden">
			<div className="flex items-center justify-center flex-1">
				<Spinner className="size-4 animate-spin" />
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		</div>
	)
}

function DiscoverPage({ userNests }: { userNests: Doc<"nests">[] }) {
	return (
		<div className="flex flex-col flex-1 overflow-hidden">
			<div className="flex items-center justify-center flex-1">
				<Spinner className="size-4 animate-spin" />
				<p className="text-sm text-muted-foreground">Loading...</p>
			</div>
		</div>
	)
}

function MobileServerIcon({
	children,
	isActive,
	isHome,
	isAddButton,
	onClick
}: {
	children: React.ReactNode
	isActive?: boolean
	isHome?: boolean
	isAddButton?: boolean
	onClick?: () => void
}) {
	return (
		<div className="relative flex items-center justify-center w-full group">
			{/* Left pill indicator */}
			<div
				className={cn(
					"absolute left-0 w-1 bg-foreground rounded-r-full transition-all duration-200",
					isActive ? "h-9" : "h-0 group-active:h-5"
				)}
			/>

			{/* Icon button */}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				onClick={onClick}
				className={cn(
					"relative flex items-center justify-center size-12 transition-all duration-200 overflow-hidden",
					isHome && isActive
						? "bg-primary text-primary-foreground rounded-2xl"
						: isHome
							? "bg-primary/80 text-primary-foreground rounded-[24px] active:rounded-2xl"
							: isAddButton
								? "bg-muted text-emerald-500 rounded-[24px] active:rounded-2xl active:bg-emerald-500 active:text-white"
								: isActive
									? "bg-primary text-primary-foreground rounded-2xl"
									: "bg-muted text-muted-foreground rounded-[24px] active:rounded-2xl active:bg-primary active:text-primary-foreground"
				)}
			>
				{children}
			</Button>
		</div>
	)
}