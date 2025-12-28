"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useMutation, useQuery } from "convex/react";
import { CheckIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";

interface FriendRequestModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export default function FriendRequestModal({
	open,
	onOpenChange,
}: FriendRequestModalProps) {

	const getFriendRequests = useQuery(api.auth.getFriendRequests);
	const sendFriendRequest = useMutation(api.auth.sendFriendRequest);
	const answerFriendRequest = useMutation(api.auth.answerFriendRequest);

	const [username, setUsername] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"send" | "pending" | "sent">("send");
	const [pendingRequests, setPendingRequests] = useState<any[]>([]);
	const [sentRequests, setSentRequests] = useState<any[]>([]);

	useEffect(() => {
		if (getFriendRequests) {

			if (!getFriendRequests || getFriendRequests.length === 0) {
				console.debug("[FriendRequestModal] > Such a sad day, no friend requests found")
				setPendingRequests([]);
				setSentRequests([]);
				return;
			}

			console.debug("[FriendRequestModal] > This guy is important, look at him with his big friend request list (¬.¬) :", getFriendRequests);
			setPendingRequests(getFriendRequests.filter((request: any) => request.method === "receive"));
			setSentRequests(getFriendRequests.filter((request: any) => request.method === "send"));
		}
	}, [getFriendRequests]);

	const handleSendRequest = async () => {
		if (!username.trim()) return;

		setIsLoading(true);
		setError(null);

		try {

			await sendFriendRequest({
				username: username,
			});
			toast.success("Friend request sent successfully");
			setUsername("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send friend request");
		} finally {
			setIsLoading(false);
		}
	};

	const handleAccept = async (requestId: string) => {
		setIsLoading(true);
		try {
			await answerFriendRequest({
				requestId: requestId,
				answer: "accept",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to accept request");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDecline = async (requestId: string) => {
		setIsLoading(true);
		try {
			await answerFriendRequest({
				requestId: requestId,
				answer: "decline",
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to decline request");
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !isLoading) {
			handleSendRequest();
		}
	};

	const formatTimeAgo = (timestamp: number) => {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return "just now";
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<UserPlusIcon className="size-5" />
						Friend Requests
					</DialogTitle>
					<DialogDescription>
						Send, accept, or manage your friend requests.
					</DialogDescription>
				</DialogHeader>

				{/* Tabs */}
				<div className="flex items-center gap-2 border-b border-border">
					<Button
						variant="ghost"
						size="sm"
						className={`rounded-b-none ${activeTab === "send" ? "border-b-2 border-primary" : ""}`}
						onClick={() => setActiveTab("send")}
					>
						Send Request
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className={`rounded-b-none ${activeTab === "pending" ? "border-b-2 border-primary" : ""}`}
						onClick={() => setActiveTab("pending")}
					>
						Pending ({pendingRequests.length})
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className={`rounded-b-none ${activeTab === "sent" ? "border-b-2 border-primary" : ""}`}
						onClick={() => setActiveTab("sent")}
					>
						Sent ({sentRequests.length})
					</Button>
				</div>

				{/* Content */}
				<div className="min-h-[200px] max-h-[400px] overflow-y-auto">
					{activeTab === "send" && (
						<div className="flex flex-col gap-4 py-2">
							<div className="flex flex-col gap-2">
								<Input
									placeholder="Enter username..."
									value={username}
									onChange={(e) => setUsername(e.target.value)}
									onKeyDown={handleKeyDown}
									disabled={isLoading}
								/>
								{error && (
									<p className="text-sm text-destructive">{error}</p>
								)}
							</div>
							<Button
								onClick={handleSendRequest}
								disabled={!username.trim() || isLoading}
								className="w-full"
							>
								{isLoading ? (
									<>
										<Spinner className="size-4 animate-spin mr-2" />
										Sending...
									</>
								) : (
									<>
										<UserPlusIcon className="size-4 mr-2" />
										Send Friend Request
									</>
								)}
							</Button>
						</div>
					)}

					{activeTab === "pending" && (
						<div className="flex flex-col gap-2 py-2">
							{pendingRequests.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<p className="text-sm text-muted-foreground">
										No pending friend requests
									</p>
								</div>
							) : (
								pendingRequests.map((request) => (
									<div
										key={request.id}
										className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
									>
										<div className="flex items-center gap-3 flex-1 min-w-0">
											<Avatar className="size-10 shrink-0">
												<AvatarImage src={request.avatar} alt={request.username} />
												<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
													{request.username.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col min-w-0 flex-1">
												<span className="text-sm font-medium truncate">
													{request.username}
												</span>
												<span className="text-xs text-muted-foreground">
													{formatTimeAgo(request.createdAt)}
												</span>
											</div>
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<Button
												size="icon-sm"
												variant="ghost"
												className="size-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
												onClick={() => handleAccept(request.id)}
												disabled={isLoading}
											>
												<CheckIcon className="size-4" />
											</Button>
											<Button
												size="icon-sm"
												variant="ghost"
												className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
												onClick={() => handleDecline(request.id)}
												disabled={isLoading}
											>
												<XIcon className="size-4" />
											</Button>
										</div>
									</div>
								))
							)}
						</div>
					)}

					{activeTab === "sent" && (
						<div className="flex flex-col gap-2 py-2">
							{sentRequests.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<p className="text-sm text-muted-foreground">
										No sent friend requests
									</p>
								</div>
							) : (
								sentRequests.map((request) => (
									<div
										key={request.id}
										className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border"
									>
										<div className="flex items-center gap-3 flex-1 min-w-0">
											<Avatar className="size-10 shrink-0">
												<AvatarImage src={request.avatar} alt={request.username} />
												<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
													{request.username.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col min-w-0 flex-1">
												<span className="text-sm font-medium truncate">
													{request.username}
												</span>
												<span className="text-xs text-muted-foreground">
													Sent {formatTimeAgo(request.createdAt)}
												</span>
											</div>
										</div>
										<span className="text-xs text-muted-foreground shrink-0">
											Pending...
										</span>
									</div>
								))
							)}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

