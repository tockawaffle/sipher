"use client";

import LogoIcon from "@/components/ui/logo-icon";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger
} from "@/components/ui/sidebar";
import { CompassIcon, HouseIcon } from "@phosphor-icons/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Separator } from "../ui/separator";
import ConnectionStatusIndicator from "./csi";
import SidebarIcon from "./sicons";

const SidebarItems: SiPher.SidebarItem[] = [
	{
		id: "discover",
		icon: <CompassIcon className="size-5" weight="fill" />,
		label: "Discover"
	}
];

/**
 * The main component for the homepage. This component is used to wrap all the components of any page.
 * It also is the controller for everything on the app, including going to other pages, showing conversations and other.
 * @param children - The children to be rendered in the sidebar inset
 */
export default function AppSidebar({ children, socketStatus, socketInfo, currentChannel, disconnectSocket, connectSocket }: SiPher.AppSidebarProps) {
	const [activeItem, setActiveItem] = useState<string>("home");

	return (
		<SidebarProvider
			style={{
				"--sidebar-width": "5rem",
				"--sidebar-width-mobile": "5rem",
			} as React.CSSProperties}
			defaultOpen={true}
		>
			<Sidebar variant="inset" collapsible="offcanvas" className="border-r-0">
				<SidebarHeader className="py-3 px-0">
					<SidebarIcon
						isActive={activeItem === "home"}
						isHome
						label="Home"
						onClick={() => setActiveItem("home")}
					>
						<LogoIcon className="size-7" />
					</SidebarIcon>
				</SidebarHeader>

				<div className="px-5 py-0.5">
					<Separator className="bg-sidebar-border" />
				</div>

				<SidebarContent className="pt-2 px-0 overflow-hidden">
					<SidebarMenu className="gap-2">
						{SidebarItems.map((item) => (
							<SidebarMenuItem key={item.id}>
								<SidebarIcon
									isActive={activeItem === item.id}
									label={item.label}
									onClick={() => setActiveItem(item.id)}
								>
									{item.icon}
								</SidebarIcon>
							</SidebarMenuItem>
						))}

						{/* Add Server/Channel button */}
						<SidebarMenuItem>
							<SidebarIcon label="Add a Server">
								<Plus className="size-5 text-green-500 hover:text-white transition-colors" />
							</SidebarIcon>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarContent>
			</Sidebar>

			<div className="flex flex-col flex-1 min-h-screen">
				<header className="flex items-center justify-between md:justify-center gap-2 px-4 py-0.5 md:border-none border-b border-border backdrop-blur sticky top-0 z-10">
					<div className="flex items-center gap-2 md:hidden">
						<SidebarTrigger className="size-9" />
					</div>
					<div className="flex items-center gap-2 justify-end w-full select-none">
						<div className="flex items-center justify-center gap-2 text-sm font-semibold w-full text-center">
							{
								currentChannel ? (
									<>
										{
											currentChannel.metadata?.icon ? (
												<Avatar className="size-5">
													<AvatarImage src={currentChannel.metadata!.icon!} alt={currentChannel.name} />
													<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
														{currentChannel.name?.charAt(0).toUpperCase()}
													</AvatarFallback>
												</Avatar>
											) : (
												<span className="size-5 rounded-full bg-primary/20 text-primary-foreground font-semibold">
													{currentChannel.name?.charAt(0).toUpperCase()}
												</span>
											)
										}
										<span className="truncate">{currentChannel.name}</span>
									</>
								) : (
									<>
										<HouseIcon className="size-5" weight="fill" />
										<span className="font-semibold">
											Home
										</span>
									</>
								)
							}
						</div>
						{/* Socket connection status */}
						<ConnectionStatusIndicator socketStatus={socketStatus} socketInfo={socketInfo} disconnectSocket={disconnectSocket} connectSocket={connectSocket} />
					</div>
					<div className="w-9 md:hidden" /> {/* Spacer for centering on mobile */}
				</header>
				<SidebarInset className="mr-0 mb-0 border-none flex-1 rounded-l-lg">
					<div className="w-full h-full bg-background border-border border rounded-l-lg rounded-bl-none overflow-auto">
						{children}
					</div>
				</SidebarInset>
			</div>
		</SidebarProvider>
	)
}