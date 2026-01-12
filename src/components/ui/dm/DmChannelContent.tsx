import { useOlmContext } from "@/contexts/olm-context";
import { useSocketContext } from "@/contexts/socket-context";
import { clearUnread, db, sendMessage } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { KeyRound } from "lucide-react";
import moment from "moment";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../dialog";
import { Input } from "../input";

interface DMChannelContentProps {
	userId: string
	channelId: string
	participantDetails: SiPher.ParticipantDetail[]
}

export default function DMChannelContent(
	{
		userId,
		channelId,
		participantDetails,
	}: DMChannelContentProps
) {

	const otherUser = useMemo(() => {
		return participantDetails.find((p) => p.id !== userId);
	}, [participantDetails, userId]);
	const [olmSession, setOlmSession] = useState<Olm.Session | null>(null);
	const [sessionError, setSessionError] = useState<string | null>(null);
	const [messageInput, setMessageInput] = useState("");
	const [messageLimit, setMessageLimit] = useState(50);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const { sendMessage: sendMessageToServer } = useSocketContext();
	const { olmAccount, password, isReady, getSession } = useOlmContext();
	const messagesEndRef = React.useRef<HTMLDivElement>(null);
	const scrollContainerRef = React.useRef<HTMLDivElement>(null);
	const prevScrollHeightRef = React.useRef<number>(0);

	// Get total message count
	const totalMessageCount = useLiveQuery(
		() => db.messages.where("channelId").equals(channelId).count(),
		[channelId]
	) ?? 0;

	// Get messages from the local database with pagination
	const allMessages = useLiveQuery(
		() => db.messages.where("channelId").equals(channelId).sortBy("timestamp"),
		[channelId]
	) ?? [];

	// Take only the most recent messages based on limit
	const messages = useMemo(() => {
		return allMessages.slice(-messageLimit);
	}, [allMessages, messageLimit]);

	const hasMoreMessages = messages.length < totalMessageCount;

	// Reset message limit when channel changes
	useEffect(() => {
		setMessageLimit(50);
	}, [channelId]);

	// Handle scroll to load more messages
	const handleScroll = React.useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
		const target = e.currentTarget;
		const scrollTop = target.scrollTop;

		// If scrolled near the top (within 100px) and there are more messages
		if (scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
			setIsLoadingMore(true);

			// Save current scroll height
			prevScrollHeightRef.current = target.scrollHeight;

			// Load 50 more messages
			await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to avoid rapid firing
			setMessageLimit(prev => prev + 50);

			setIsLoadingMore(false);
		}
	}, [hasMoreMessages, isLoadingMore]);

	// Preserve scroll position after loading more messages
	useEffect(() => {
		if (prevScrollHeightRef.current > 0 && scrollContainerRef.current) {
			const newScrollHeight = scrollContainerRef.current.scrollHeight;
			const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
			scrollContainerRef.current.scrollTop += scrollDiff;
			prevScrollHeightRef.current = 0;
		}
	}, [messages.length]);

	// Scroll to bottom on initial load / channel change (instant)
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
	}, [channelId]);

	// Auto-scroll to bottom when new messages arrive (smooth)
	useEffect(() => {
		if (messages.length > 0 && scrollContainerRef.current) {
			const container = scrollContainerRef.current;
			const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;

			// Only auto-scroll if user is near the bottom
			if (isNearBottom) {
				messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
			}
		}
	}, [allMessages.length]);

	// Clear unread count when entering the channel
	useEffect(() => {
		clearUnread(channelId);
		console.debug("[DMChannelContent] Cleared unread count for channel", channelId);
	}, [channelId]);

	// Guard: Check if otherUser exists
	if (!otherUser) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center space-y-2">
					<p className="text-muted-foreground">Loading participant information...</p>
				</div>
			</div>
		);
	}

	// Get or create session when OLM is ready and we have the other user's account
	useEffect(() => {
		const loadSession = async () => {
			if (!isReady || !olmAccount || !otherUser || !otherUser.olmAccount) {
				return;
			}

			setSessionError(null);

			try {
				const session = await getSession(otherUser.id, otherUser.olmAccount);

				if (session) {
					setOlmSession(session);
				} else {
					setSessionError("Failed to create encryption session");
				}
			} catch (err) {
				console.error("[DMChannelContent] Failed to get session:", err);
				setSessionError(err instanceof Error ? err.message : "Unknown error");
			}
		};

		loadSession();
	}, [isReady, olmAccount, otherUser, password,])

	// Check if OLM is ready
	if (!isReady || !olmAccount) {
		return <div>Loading encryption keys...</div>
	}

	// Get the other user's id key and OT keys from the server to be prepared for messaging
	if (!otherUser.olmAccount) {
		return (
			<Dialog open={true} onOpenChange={() => { }}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
							<KeyRound className="h-8 w-8 text-accent-foreground" />
						</div>
						<DialogTitle className="text-2xl text-center">Encryption Setup Required</DialogTitle>
					</DialogHeader>
					<DialogDescription className="space-y-4 pt-2">
						<div className="rounded-lg bg-card border border-border p-4">
							<p className="text-sm text-card-foreground/90 leading-relaxed">
								<span className="font-semibold text-card-foreground">{otherUser.name}</span> hasn't set up end-to-end encryption yet.
							</p>
						</div>
						<div className="space-y-2 text-sm text-muted-foreground">
							<p className="flex items-start gap-2">
								<span className="text-accent-foreground/60 mt-0.5">•</span>
								<span>They need to log in and complete the encryption setup</span>
							</p>
							<p className="flex items-start gap-2">
								<span className="text-accent-foreground/60 mt-0.5">•</span>
								<span>Once complete, you'll be able to send encrypted messages</span>
							</p>
						</div>
						<p className="text-xs text-center text-muted-foreground/70 pt-2">
							🔒 All messages are end-to-end encrypted for your privacy
						</p>
					</DialogDescription>
				</DialogContent>
			</Dialog>
		)
	}

	// Show error if session creation failed
	if (sessionError) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center space-y-2">
					<p className="text-destructive">Failed to create encryption session</p>
					<p className="text-sm text-muted-foreground">{sessionError}</p>
				</div>
			</div>
		);
	}

	// Wait for session to be established
	if (!olmSession) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center space-y-2">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
					<p className="text-sm text-muted-foreground">Establishing secure connection...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="flex-1 min-h-0 overflow-hidden">
				<div
					ref={scrollContainerRef}
					className="h-full overflow-y-auto flex flex-col"
					onScroll={handleScroll}
				>
					{/* Spacer to push messages to the bottom when there are few messages */}
					<div className="flex-1 min-h-0" />

					<div className="pt-2 md:pt-4">
						{/* Load more indicator */}
						{hasMoreMessages && (
							<div className="flex justify-center py-4">
								{isLoadingMore ? (
									<div className="flex items-center gap-2 text-muted-foreground">
										<div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
										<span className="text-xs">Loading older messages...</span>
									</div>
								) : (
									<button
										onClick={() => {
											setIsLoadingMore(true);
											prevScrollHeightRef.current = scrollContainerRef.current?.scrollHeight ?? 0;
											setTimeout(() => {
												setMessageLimit(prev => prev + 50);
												setIsLoadingMore(false);
											}, 100);
										}}
										className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded-md hover:bg-muted/50 active:bg-muted/70"
									>
										Load more messages
									</button>
								)}
							</div>
						)}
						{messages.map((msg, index) => {
							const sender = participantDetails.find((p) => p.id === msg.fromUserId);
							const selfDetail = participantDetails.find((p) => p.id === userId);
							const isSelf = msg.fromUserId === userId;
							const displayName = isSelf ? selfDetail?.displayUsername ?? selfDetail?.username ?? selfDetail?.name ?? "You" : (sender?.displayUsername ?? sender?.username ?? sender?.name ?? "Unknown");
							const timestamp = moment(msg.timestamp);
							const timeLabel = timestamp.isSame(moment(), "day") ? timestamp.format("h:mm A") : timestamp.format("MMM D, YYYY h:mm A");

							// Check if this message is from the same user as the previous one within 5 minutes
							const prevMsg = index > 0 ? messages[index - 1] : null;
							const isGrouped = prevMsg &&
								prevMsg.fromUserId === msg.fromUserId &&
								msg.timestamp && prevMsg.timestamp &&
								(msg.timestamp - prevMsg.timestamp) < 5 * 60 * 1000;

							return (
								<div
									key={msg.id}
									className="group relative px-2 md:px-4 py-0.5 hover:bg-muted/50 active:bg-muted/50 transition-colors duration-100"
								>
									{!isGrouped ? (
										// Full message with avatar and header
										<div className="flex gap-2 md:gap-4 mt-3 md:mt-[17px]">
											<Avatar className="w-8 h-8 md:w-10 md:h-10 shrink-0 mt-0.5">
												<AvatarImage src={sender?.image ?? undefined} alt={displayName} />
												<AvatarFallback className="text-xs">
													{displayName.slice(0, 2).toUpperCase()}
												</AvatarFallback>
											</Avatar>

											<div className="flex-1 min-w-0 pt-0.5">
												<div className="flex items-baseline gap-2 leading-snug flex-wrap">
													<span className="font-semibold text-sm md:text-[15px] text-foreground hover:underline cursor-pointer">
														{displayName}
													</span>
													<span className="text-[10px] md:text-[11px] text-muted-foreground font-medium">
														{timeLabel}
													</span>
												</div>
												<div className="text-sm md:text-[15px] leading-[1.375rem] text-foreground mt-0.5 wrap-break-word">
													{msg.content}
												</div>
											</div>
										</div>
									) : (
										// Compact message without avatar (grouped)
										<div className="flex gap-2 md:gap-4 leading-[1.375rem]">
											<div className="w-8 md:w-10 shrink-0 flex items-start justify-end pt-0.5">
												<span className="text-[10px] text-transparent group-hover:text-muted-foreground transition-colors duration-100 font-medium">
													{
														timeLabel
													}
												</span>
											</div>
											<div className="flex-1 min-w-0 text-sm md:text-[15px] leading-[1.375rem] text-foreground wrap-break-word">
												{msg.content}
											</div>
										</div>
									)}
								</div>
							);
						})}
						{/* Invisible element for auto-scrolling */}
						<div ref={messagesEndRef} />
					</div>
				</div>
			</div>

			{/* Message input */}
			<div className="shrink-0 px-2 md:px-4 pb-4 md:pb-6 pt-2">
				<Input
					className="h-10 md:h-11 rounded-lg bg-muted border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 md:px-4 text-sm md:text-[15px]"
					placeholder={
						otherUser.status === "offline" ?
							"As of now, you cannot message offline users." :
							`Message @${otherUser.username ?? otherUser.name}`
					}
					value={messageInput}
					onChange={(e) => setMessageInput(e.target.value)}
					disabled={otherUser.status === "offline"}
					onKeyDown={async (e) => {
						if (e.key === 'Enter' && !e.shiftKey && messageInput.trim() && password) {
							e.preventDefault();
							try {
								const messageId = await sendMessage({
									channelId,
									content: messageInput,
									fromUserId: userId,
									to: otherUser.id,
									timestamp: Date.now(),
									status: "sent",
								}, olmSession, sendMessageToServer, {
									userId,
									recipientId: otherUser.id,
									password,
								});

								if (messageId) {
									setMessageInput("");
								}
							} catch (error) {
								console.error("[DMChannelContent] Failed to send message:", error);
								toast.error("Failed to send message: " + (error instanceof Error ? error.message : "Unknown error"));
							}
						}
					}}
				/>
			</div>
		</div>
	);
}