"use client"
import AppSidebar from "@/components/home";
import OlmSetupDialog from "@/components/olm/olm-setup-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import UserFloatingCard from "@/components/ui/user/floating-card";
import { useOlmSetup } from "@/hooks/use-olm-setup";
import { useSocket } from "@/hooks/use-socket";
import { authClient } from "@/lib/auth/client";
import { useMutation, useQuery } from "convex/react";
import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";

const mockPhrases = [
	"No bitches? Womp womp",
	"You're all alone",
	"No friends? Damn",
	"Oh look, a spiderweb!",
	"You must be bored, go make some friends",
	"DMs drier than the Sahara",
	"Echo echo... anyone there?",
	"Your inbox called, it's collecting dust",
	"Even the bots won't slide in",
	"Social life on life support",
	"Crickets in the chat",
	"Zero notifications? Skill issue",
	"This is the quietest room on the internet",
	"Go outside, the graphics are better",
	"Loneliness speedrun any%",
	"Your DMs look like a ghost town",
	"Population: You",
	"Unread messages: 0 (forever)",
	"Bro really out here talking to himself",
	"The void stares back",
	"Touch grass detected: false",
	"Friends list looking minimalist",
	"Inbox so empty it has an echo",
	"No one loves you... yet",
	"Slide into someone's DMs instead of staring at none",
];

const comfortingPhrases = [
	"Quiet inbox today—just a little peace and quiet",
	"Empty DMs mean more time for you",
	"Even when it's silent here, you're never truly alone",
	"Sometimes the best company is your own thoughts",
	"Take a deep breath—this calm won't last forever",
	"Your worth isn't measured by notifications",
	"The right people will show up exactly when they're meant to",
	"God is with you in the silence, just like always",
	"'Be still, and know that I am God' – Psalm 46:10",
	"An empty inbox is just a blank page waiting for new stories",
	"Enjoy the quiet while it lasts—life gets loud again soon",
	"You're building strength in these quiet moments",
	"Real connections can't be rushed; they're coming",
	"In the stillness, you can hear your own heart clearest",
	"'I am with you always' – Matthew 28:20",
	"No rush—good things take time",
	"This is your moment to recharge without distractions",
	"Loneliness is temporary; connection is inevitable",
	"God's presence fills every empty space",
	"Silence isn't empty—it's full of possibility",
	"You're exactly where you need to be right now",
	"The best conversations often start after a little quiet",
	"Peaceful DMs = a peaceful mind",
	"Don't worry, someone is thinking of you right now",
	"You're not alone, we're all here for you",
	"Trust the process, even if it's slow and painful",
	"Someone out there is thinking of messaging you... any second now",
	"You're loved more than you know, messages or not",
	"Silence is a rare gift in such a noisy world",
	"No notifications means no demands on your energy today",
	"God is working behind the scenes on your behalf",
	"Your value exists completely outside of this app",
	"Take this moment to simply be, rather than do",
	"The right message will arrive at the perfect time",
	"You are safe, loved, and held in this silence",
	"Let the quiet wash over you like a gentle wave",
	"He knows the desires of your heart—have faith",
	"A quiet screen is just an invitation to look up",
	"True connection starts with being comfortable within yourself",
	"Your soul needs this rest more than a quick reply",
	"Someone, somewhere, is grateful that you exist today",
	"Prayers travel much further than any direct message can",
	"You are preserving your peace for something better",
	"God's timing is rarely early, but never late",
	"Use this time to love yourself a little harder",
	"The world is loud, but your space is peaceful",
	"You don't need a buzz in your pocket to matter",
	"Rest easy, the right people are finding their way"
];

export default function Home() {
	const { data, error, isPending } = authClient.useSession();

	const [page, setPage] = useState<"friends" | "settings">("friends");
	const [currentChannel, setCurrentChannel] = useState<SiPher.Channel | null>(null);
	const [openDmChannels, setOpenDmChannels] = useState<SiPher.Channel[] | []>([]);
	const [availableServers, setAvailableServers] = useState<SiPher.Server[] | []>([]);

	// Friends page state
	const [friendsPage, setFriendsPage] = useState<"all" | "available">("all");
	const [friendsSearch, setFriendsSearch] = useState<string>("");

	const hasServerOlm = useQuery(
		api.auth.retrieveServerOlmAccount,
		data?.user?.id ? { userId: data.user.id } : "skip"
	);

	// Mutation for sending keys to server
	const sendKeysToServer = useMutation(api.auth.sendKeysToServer);

	const updateUserStatus = useMutation(api.auth.updateUserStatus);
	useEffect(() => {
		if (!data) return;

		const status = data.user.status
		if (!status) return;

		if (status.status === "offline" && !status.isUserSet) {
			updateUserStatus({ status: "online", isUserSet: false });
		}
	}, [data?.user?.id, updateUserStatus, data?.user?.status]);

	// Custom hooks for socket and OLM management
	const { socketStatus, socketInfo } = useSocket(data?.user?.id);
	const { olmStatus, showOlmModal, setShowOlmModal, handleCreateAccount } = useOlmSetup({
		userId: data?.user?.id,
		hasServerOlm,
		sendKeysToServer
	});

	if (isPending) {
		return <div className="flex items-center justify-center h-screen w-full bg-background">
			<Spinner className="size-10 animate-spin" />
		</div>
	}

	if (error || !data) {
		return redirect(`/auth${error ? `?error=${error.cause}` : "no-data"}`);
	}


	const getRandomPhrase = useCallback(() => {
		const phrases = {
			comforting: comfortingPhrases,
			mocking: mockPhrases,
			both: [...comfortingPhrases, ...mockPhrases]
		}

		const preference = data.user.metadata?.phrasePreference as keyof typeof phrases;

		if (!preference) return comfortingPhrases[Math.floor(Math.random() * comfortingPhrases.length)];

		return phrases[preference][Math.floor(Math.random() * phrases[preference].length)];
	}, [data.user.metadata?.phrasePreference]);

	return (
		<>
			<UserFloatingCard user={data.user} />
			<AppSidebar socketStatus={socketStatus} socketInfo={socketInfo}>
				<div className="flex flex-col h-full">
					{/* Header - fixed height and sticky */}
					<div className="flex items-center min-h-10 max-h-10 border-b border-border/40 sticky top-0 z-10 bg-background">
						{/* SCS or DM Selector */}
						<div className="flex justify-center items-center gap-2 max-w-72 min-w-72 border-r h-10 border-border/40">
							{
								// If the current channel is none or a DM, we show a search bar
								!currentChannel || currentChannel.type === SiPher.ChannelType.DM ? (
									<Button
										variant="outline"
										className="w-[calc(100%-2rem)] h-3/4 rounded-lg hover:cursor-pointer"
									>
										<SearchIcon className="size-4" />
										<span className="text-sm font-medium">Search for a Server or DM</span>
									</Button>
								) : (
									<span className="text-sm font-medium">{currentChannel.name}</span>
								)
							}
						</div>
						{/* Page title/options */}
						<div className="flex flex-row justify-start items-center gap-2 w-full">
							<div className="flex flex-row gap-2 justify-start p-2">
								<UsersIcon className="size-4" />
								<span className="text-sm font-medium">Friends</span>
							</div>
							<span className="text-sm font-medium">•</span>
							<div className="flex flex-row gap-2 h-full">
								<Button variant="ghost" disabled={friendsPage === "available"} className={`h-full hover:cursor-pointer justify-start p-2 ${friendsPage === "available" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setFriendsPage("available")}>
									Available
								</Button>
								<Button variant="ghost" disabled={friendsPage === "all"} className={`h-full hover:cursor-pointer justify-start p-2 ${friendsPage === "all" ? "bg-primary text-primary-foreground" : ""}`} onClick={() => setFriendsPage("all")}>
									All Known
								</Button>
								<Button variant="ghost" className="h-full bg-primary text-primary-foreground hover:cursor-pointer justify-start p-2 ">
									Add Friend
								</Button>
							</div>
						</div>
					</div>
					{/* Content Area - Channel List + Main Content */}
					<div className="flex flex-1 overflow-hidden">
						{/* Channel List */}
						<div className="flex flex-col shrink-0 max-w-72 min-w-72 border-r border-border/40">
							{/* Channel List Header - sticky top */}
							<div className="flex justify-center items-center min-h-10 max-h-50  bg-background">
								<div className="flex flex-col justify-start items-start p-1 gap-2 w-full">
									<Button variant="ghost" className="w-full h-full hover:cursor-pointer justify-start" onClick={() => setPage("friends")}>
										<UsersIcon className="size-4" />
										<span className="text-sm font-medium">Friends</span>
									</Button>
								</div>
							</div>
							<div className="w-[calc(100%-0.8rem)] h-px bg-border/40 mx-2" />
							{/* Channel List */}
							<div className="flex flex-col flex-1 overflow-y-auto">
								{/* Channel List Item */}
								<div className="flex items-center min-h-10 max-h-10">
									{
										currentChannel && currentChannel.type === SiPher.ChannelType.DM || !currentChannel ? (
											<div className="flex flex-col items-center min-h-10 max-h-10 w-full">
												<div className="flex items-center w-full justify-between p-2 select-none">
													<span className="text-xs font-semibold text-muted-foreground">Direct Messages</span>
													<Button variant="ghost" size="icon-sm" className="hover:cursor-pointer hover:bg-transparent!">
														<PlusIcon className="size-4" />
													</Button>
												</div>
												{
													openDmChannels.length > 0 ? (
														openDmChannels.map((channel) => (
															<Button variant="ghost" size="icon-sm" className="hover:cursor-pointer hover:bg-transparent!">
																<span className="text-sm font-medium">{channel.name}</span>
															</Button>
														))
													) : (
														<div className="flex items-center min-h-10 max-h-10">
															<span className="text-xs font-medium text-muted-foreground text-center text-wrap">
																{getRandomPhrase()}
															</span>
														</div>
													)
												}
											</div>
										) : (
											<div className="flex items-center min-h-10 max-h-10">
												<span className="text-sm font-medium">No channels</span>
											</div>
										)
									}
								</div>
							</div>
						</div>

						{/* Main Content */}
						<div className="flex flex-col flex-1 overflow-hidden">
							{
								page === "friends" ? (
									<div className="flex flex-col flex-1 overflow-y-auto p-4">
										<div className="flex flex-col items-center min-h-10 max-h-10">
											<Input
												placeholder="Search for a friend..."
												value={friendsSearch}
												onChange={(e) => setFriendsSearch(e.target.value)}
												className="w-full min-h-10 sticky top-0"
											/>
											{
												friendsPage === "all" ? (
													<div className="flex items-center min-h-10 max-h-10">
														<span className="text-sm font-medium">All Friends</span>
													</div>
												) : (
													<div className="flex flex-col items-start w-full p-2 gap-2 pt-4">
														<span className="text-sm text-start font-medium">Available Friends • {data.user.friends && data.user.friends.length > 0 ? data.user.friends.length : 0}</span>
														{
															data.user.friends && data.user.friends.length > 0 ? (
																data.user.friends.map((friend) => (
																	<div className="flex items-center min-h-10 max-h-10">
																		<span className="text-sm font-medium">{friend}</span>
																	</div>
																))
															) : (
																<span className="text-sm font-medium text-muted-foreground">
																	{getRandomPhrase()}
																</span>
															)
														}
													</div>
												)
											}
										</div>
									</div>
								) : page === "settings" ? (
									<div className="flex flex-col flex-1 overflow-y-auto p-4">
										<div className="flex items-center min-h-10 max-h-10">
											<span className="text-sm font-medium">Servers</span>
										</div>
									</div>
								) : null
							}
						</div>
					</div>
				</div>
			</AppSidebar>

			{/* OLM Account Setup/Sync Modal */}
			<OlmSetupDialog
				open={showOlmModal}
				onOpenChange={setShowOlmModal}
				olmStatus={olmStatus}
				onCreateAccount={handleCreateAccount}
			/>
		</>
	)
}