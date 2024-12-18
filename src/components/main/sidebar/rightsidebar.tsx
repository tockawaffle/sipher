import React, {useCallback, useEffect, useState} from "react";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {Avatar, AvatarFallback} from "@/components/ui/avatar";
import {Separator} from "@/components/ui/separator";
import {ScrollArea} from "@/components/ui/scroll-area";
import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Check, LogOut, Mail, MailPlus, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {GearIcon} from "@radix-ui/react-icons";
import Link from "next/link";
import {useRealtime} from "@/components/main/realtime";
import {useUser} from "@/contexts/user";
import {usePathname} from "next/navigation";
import {useSharedState} from "@/hooks/shared-states";

interface RightSidebarContentProps {
	isDarkMode: boolean;
}

export default function RightSidebarContent(
	{
		isDarkMode,
	}: RightSidebarContentProps) {
	
	const [copied, setCopied] = useState<boolean>(false);
	
	const {threads, setThreads} = useSharedState();
	useRealtime({setThreads});
	
	const {user} = useUser();
	const {username, suuid, requests = []} = user;
	const pathname = usePathname();
	
	const pendingRequests = requests?.length ?? 0;
	
	const fetchThreads = useCallback(async () => {
		try {
			const req = await fetch("/api/user/get/threads")
			if (req.ok) {
				const {threads} = await req.json() as { threads: SiPher.Thread[] | [] }
				setThreads(threads)
			} else {
				setThreads([])
			}
		} catch (error) {
			console.log(error);
			setThreads([])
		}
	}, [setThreads]);
	
	useEffect(() => {
		fetchThreads();
	}, [fetchThreads]);
	
	const handleAccept = async (request: string) => {
		try {
			const response = await fetch("/api/user/create/thread", {
				method: "POST",
				body: JSON.stringify({participant: request}),
			});
			if (response.ok) {
				fetchThreads();
			}
		} catch (error) {
			console.error('Error accepting request:', error);
		}
	}
	
	return (
		<>
			<div className={`flex flex-col h-full w-[240px]`}>
				<TooltipProvider>
					<Tooltip open={copied} onOpenChange={setCopied}>
						<TooltipTrigger/>
						<TooltipContent arrowPadding={10} className={"p-2 shadow-cyan-950 shadow-md"}>
							Copied SUUID to clipboard!
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<div
					onClick={() => {
						setCopied(true)
						navigator.clipboard.writeText(suuid)
					}}
					className={`flex items-center  p-3 m-2 ${isDarkMode ? "hover:bg-accent/90" : "hover:bg-secondary/20"} rounded-full transition-colors duration-200 cursor-pointer select-none`}>
					<Avatar className="w-12 h-12 mr-3">
						<AvatarFallback>{username.charAt(0)}</AvatarFallback>
					</Avatar>
					<div>
						<h3 className={`font-semibold text-[17px] ${isDarkMode ? "text-white" : "text-black"}`}>{username}</h3>
						<p className="text-xs text-muted-foreground">${suuid}</p>
					</div>
				</div>
				<Separator className="my-2"/>
				<ScrollArea className="flex-grow max-h-[500px] px-4 py-4">
					<nav>
						<ul className="space-y-1">
							<DropdownMenu>
								<DropdownMenuTrigger>
									<div className={"flex flex-row items-center w-full justify-start text-[17px]"}>
										{
											(user.requests?.length ?? 0) > 0 ? (
												<MailPlus className="w-8 h-8 mr-3 p-1"/>
											) : (
												<Mail className="w-8 h-8 mr-3 p-1"/>
											)}
										Requests
									</div>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="px-4 py-1 w-56" side={"right"}>
									<div className={"flex flex-row w-full justify-between items-center select-none"}>
										<p>User</p>
										<p>Decline | Accept</p>
									</div>
									{
										pendingRequests > 0 && requests!.map((request, item) => {
											return (
												<div key={item} className={"flex flex-col w-full"}>
													<Separator className="my-2"/>
													<div key={item} className={"flex flex-row space-x-2 w-full items-center"}>
														<p className={"text-secondary-foreground"}>{request}</p>
														<div className={"flex flex-row justify-end space-x-1 w-full"}>
															<Button size={"icon"} className={"bg-red-500"}>
																<X className={"w-4 h-4"}/>
															</Button>
															<Button onClick={() => {
																handleAccept(request)
															}} size={"icon"} className={"bg-green-500"}>
																<Check className={"w-4 h-4"}/>
															</Button>
														</div>
													</div>
												</div>
											)
										}) || (
											<p>Nothing new here</p>
										)
									}
								</DropdownMenuContent>
							</DropdownMenu>
							<Separator className="my-2"/>
							{threads && threads.length > 0 ? (
								threads.map((thread, index) => {
									// Gets the user's username instead of the SUUID to use as a recognizable user.
									const otherUser = thread.participants.filter((user) => user !== username)[0];
									return (
										<li key={index}>
											<Link href={`/${thread.thread_id}`} passHref>
												<Button
													variant={pathname.replace("/", "") === thread.thread_id ? "secondary" : "ghost"}
													className={`w-full justify-start text-[17px] p-2`}>
													<Avatar className="w-8 h-8 mr-3">
														<AvatarFallback>{otherUser.charAt(0).toUpperCase()}</AvatarFallback>
													</Avatar>
													{otherUser}
												</Button>
											</Link>
										</li>
									)
								})
							) : (
								<p>No threads available</p>
							)}
						</ul>
					</nav>
				</ScrollArea>
				<div className="p-3 space-y-3">
					<Separator/>
					<Button
						variant="outline"
						className="w-full justify-start text-[17px] py-2 text-primary"
						onClick={() => window.location.href = "/settings"}
					>
						<GearIcon className="w-4 h-4 mr-3"/>
						Settings
					</Button>
					<Button onClick={() => {
						fetch("/api/auth/logout", {
							method: "GET",
							headers: {
								"Content-Type": "application/json"
							},
						}).then((response) => {
							if (response.ok) {
								window.location.href = "/auth/login"
							}
						})
					}} variant="outline" className="w-full justify-start text-[17px] py-2 text-destructive">
						<LogOut className="w-4 h-4 mr-3"/>
						Log Out
					</Button>
				</div>
			</div>
		</>
	)
}