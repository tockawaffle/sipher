"use client"
import React, {useCallback, useEffect, useState} from "react"
import {usePathname} from "next/navigation"
import Link from "next/link"
import {AnimatePresence, motion} from "framer-motion"
import {LogOut, Mail, MailPlus, X} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Avatar, AvatarFallback} from "@/components/ui/avatar"
import {Separator} from "@/components/ui/separator"
import {ScrollArea} from "@/components/ui/scroll-area"
import {GearIcon} from "@radix-ui/react-icons"
import Image from "next/image";
import MobileHeader from "@/components/main/sidebar/mobile";
import {useUser} from "@/contexts/user";
import {useRefs, useUIState} from "@/hooks/shared-states";
import {useToast} from "@/hooks/use-toast";
import {useTheme} from "next-themes";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from "@/components/ui/dropdown-menu";

type SidebarProps = {
	children?: React.ReactNode
}

function Sidebar(
	{
		children
	}: SidebarProps
) {
	const pathname = usePathname()
	
	const [selectedThreads, setSelectedThreads] = useState("");
	const [threads, setThreads] = useState<SiPher.Messages[] | []>([]);
	const [threadMenu, setThreadMenu] = useState<SiPher.Messages[] | []>([]);
	const [copied, setCopied] = useState<boolean>(false);
	const {theme, systemTheme} = useTheme()
	const {toast} = useToast();
	
	const {isDrawerOpen, setIsDrawerOpen} = useUIState()
	const {drawerRef} = useRefs();
	
	const [pendingRequest, setPendingRequest] = useState<number>(0);
	
	const {user, getUser} = useUser()
	
	const {
		username,
		suuid
	} = user
	
	useEffect(() => {
		setPendingRequest(user.requests?.length || 0);
	}, [user])
	
	useEffect(() => {
		const getThreads = async () => {
			try {
				const req = await fetch("/api/user/get/threads")
				if (req.ok) {
					const {threads} = await req.json() as { threads: SiPher.Messages[] | [] }
					setThreads(threads)
				} else {
					setThreads([])
					toast({
						title: "Error",
						description: "An unknown error occurred",
						variant: "destructive",
						duration: 5000,
					})
				}
			} catch (error) {
				setThreads([])
			}
		}
		
		getThreads()
		return () => setThreads([])
	}, [toast])
	
	const generateThreads = useCallback(() => {
		threads.map(async (thread) => {
			if (thread.participants.length > 2) {
				return (
					<li key={thread.id}>
						<Link href={thread.id} passHref>
							<Button
								variant={pathname === thread.id ? "secondary" : "ghost"}
								className="w-full justify-start text-[17px] py-4"
							>
								<Avatar className="w-8 h-8 mr-3 p-1">
									<AvatarFallback>{thread.name!}</AvatarFallback>
								</Avatar>
								{thread.name!}
							</Button>
						</Link>
					</li>
				)
			} else {
				const fetchOtherUser = async () => {
					await getUser("fetchOtherUser - const", thread.id)
				}
			}
		})
	}, [threads])
	
	const isDarkMode = theme === "system"
		? systemTheme === "dark"
		: theme === "dark"
	
	const RightSidebarContent = () => (
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
			<ScrollArea className="flex-grow max-h-[590px] px-4 py-4">
				<nav>
					<ul className="space-y-1">
						<DropdownMenu>
							<DropdownMenuTrigger>
								<div className={"flex flex-row items-center w-full justify-start text-[17px]"}>
									{
										pendingRequest > 0 ? (
											<MailPlus className="w-8 h-8 mr-3 p-1"/>
										) : (
											<Mail className="w-8 h-8 mr-3 p-1"/>
										)
									}
									Requests
								</div>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="px-4 py-1 w-56" side={"right"}>
								{
									pendingRequest > 0 && user.requests.map((request, item) => {
										return (
											<p key={request}>{request}</p>
										)
									}) || (
										<p>Nothing new here</p>
									)
								}
							</DropdownMenuContent>
						</DropdownMenu>
						{threads.map((thread) => (
							<li key={thread.id}>
								<Link href={thread.id} passHref>
									<Button
										variant={pathname === thread.id ? "secondary" : "ghost"}
										className="w-full justify-start text-[17px] py-4"
									>
										<Avatar className="w-8 h-8 mr-3 p-1">
											<AvatarFallback>{thread.id}</AvatarFallback>
										</Avatar>
										{thread.id}
									</Button>
								</Link>
							</li>
						))}
					</ul>
				</nav>
			</ScrollArea>
			<div className="p-3 space-y-3">
				<Separator/>
				<Button
					variant="outline"
					className="w-full justify-start text-[17px] py-2 text-primary"
					onClick={() => window.location.href = "/config"}
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
	)
	
	return (
		<>
			<MobileHeader/>
			<aside
				className={`hidden lg:flex flex-col items-end h-screen max-h-[900px] sticky top-0 border-r border-border ${
					isDarkMode ? "bg-background" : "white"
				}`}
			>
				<div className="flex justify-items-start w-[240px] mt-1.5 hover:scale-105 transition-all duration-300">
					<Link href={"/"} passHref className={"flex flex-row items-center ml-1.5"}>
						<Image
							src={isDarkMode ? "/logos/logo.png" : "/logos/logo-light.png"}
							alt="Tocka&lsquo;s Nest"
							width={64}
							height={64}
							className="w-16 h-16 cursor-pointer rounded-full antialiased"
						/>
						<p className={"text-center text-xl font-bold antialiased"}>SiPher</p>
					</Link>
				</div>
				<RightSidebarContent/>
			</aside>
			<AnimatePresence>
				{isDrawerOpen && (
					<motion.div
						ref={drawerRef}
						initial={{x: '-100%'}}
						animate={{x: 0}}
						exit={{x: '-100%'}}
						transition={{type: 'tween'}}
						className={`fixed inset-y-0 left-0 w-64 ${
							isDarkMode ? "bg-background" : "bg-white"
						} border-r border-border shadow-lg z-50 lg:hidden`}
					>
						<div className="h-full flex flex-col">
							<Button
								variant="ghost"
								size="icon"
								className="absolute top-2 right-2"
								onClick={() => setIsDrawerOpen(false)}
							>
								<X className="w-5 h-5"/>
								<span className="sr-only">Close menu</span>
							</Button>
							<RightSidebarContent/>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
			{
				children ?? null
			}
		</>
	)
}

export default Sidebar