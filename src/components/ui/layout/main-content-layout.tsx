"use client"

import FriendRequestModal from "@/components/home/modals/friendRequest"
import { db } from "@/lib/db"
import { useQuery } from "convex/react"
import { useLiveQuery } from "dexie-react-hooks"
import * as React from "react"
import { useEffect, useMemo } from "react"
import { api } from "../../../../convex/_generated/api"
import { FriendsPage } from "../friends/friends-page"
import { ChannelList } from "./channel-list"
import { PageHeader } from "./page-header"
import { SettingsPage } from "./settings-page"

export interface MainContentLayoutProps {
	socketStatus: string
	emptyChannelMessage?: string
	emptyFriendsMessage?: string
	userId: string
	dmChannelId?: string
	serverId?: string
	serverChannelId?: string
}

export function MainContentLayout({
	socketStatus,
	emptyChannelMessage,
	emptyFriendsMessage,
	userId,
	dmChannelId,
	serverId,
	serverChannelId,
}: MainContentLayoutProps) {
	const [page, setPage] = React.useState<"friends" | "support" | "dm" | "server">(
		dmChannelId ? "dm" : serverChannelId ? "server" : "friends"
	)
	const [friendsPage, setFriendsPage] = React.useState<"all" | "available">("all")
	const [friendModal, setFriendModal] = React.useState(false)
	const [currentChannel] = React.useState<SiPher.Channel | null>(null)

	// Use useLiveQuery to reactively fetch channels - automatically updates when DB changes
	const openDmChannels = useLiveQuery(
		() => db.channels.where("participants").equals(userId).toArray(),
		[userId]
	) ?? []

	const getParticipantDetails = useQuery(api.auth.getParticipantDetails, dmChannelId ? {
		participantIds: openDmChannels
			.find((channel) => channel.id === dmChannelId)
			?.participants
			.filter((participant) => participant !== userId) ?? []
	} : "skip")

	// Combine channel from local DB with participant details from Convex
	const dmChannel = useMemo(() => {
		if (!dmChannelId) return undefined

		const channel = openDmChannels.find((ch) => ch.id === dmChannelId)
		if (!channel || !getParticipantDetails) return undefined

		return {
			id: channel.id,
			participantDetails: getParticipantDetails ?? []
		}
	}, [openDmChannels, dmChannelId, getParticipantDetails])

	// Sync page state with route props for seamless navigation
	useEffect(() => {
		if (dmChannelId) {
			setPage("dm");
		} else if (serverChannelId) {
			setPage("server");
		} else {
			setPage("friends");
		}
	}, [dmChannelId, serverChannelId]);

	return (
		<>
			<div className="flex flex-col h-full">
				{/* Header */}
				<PageHeader
					currentChannel={currentChannel}
					page={page}
					friendsPage={friendsPage}
					onFriendsPageChange={setFriendsPage}
					onAddFriend={() => setFriendModal(true)}
					dmChannel={dmChannel}
					serverId={serverId}
					serverChannelId={serverChannelId}
				/>

				{/* Content Area - Channel List + Main Content */}
				<div className="flex flex-1 overflow-hidden">

					<ChannelList
						currentChannel={currentChannel}
						openDmChannels={openDmChannels}
						page={page}
						onPageChange={setPage}
						emptyMessage={emptyChannelMessage}
						dmChannel={dmChannel}
					/>

					{/* Main Content */}
					<div className="flex flex-col flex-1 overflow-hidden">
						{page === "dm" ? (
							<div className="flex flex-col h-full p-4">
								<p className="text-sm text-muted-foreground">DM chat with {dmChannelId}</p>
							</div>
						) : page === "server" ? (
							<div className="flex flex-col h-full p-4">
								<p className="text-sm text-muted-foreground">Server channel {serverChannelId}</p>
							</div>
						) : page === "friends" ? (
							<FriendsPage
								userId={userId}
								friendsPage={friendsPage}
								socketStatus={socketStatus}
								emptyMessage={emptyFriendsMessage}
							/>
						) : (
							<SettingsPage />
						)}
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

