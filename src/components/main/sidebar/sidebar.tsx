"use client"
import React from "react"
import Link from "next/link"
import {AnimatePresence, motion} from "framer-motion"
import {X} from "lucide-react"
import {Button} from "@/components/ui/button"
import Image from "next/image";
import MobileHeader from "@/components/main/sidebar/mobile";
import {useRefs, useUIState} from "@/hooks/shared-states";
import {useToast} from "@/hooks/use-toast";
import {useTheme} from "next-themes";
import RightSidebarContent from "@/components/main/sidebar/rightsidebar";

type SidebarProps = {
	children?: React.ReactNode
}

function Sidebar(
	{
		children
	}: SidebarProps
) {
	const {theme, systemTheme} = useTheme();
	const {toast} = useToast();
	
	const {isDrawerOpen, setIsDrawerOpen} = useUIState();
	const {drawerRef} = useRefs();
	
	const isDarkMode = theme === "system"
		? systemTheme === "dark"
		: theme === "dark"
	
	
	const handleAcceptRequest = async () => {
	
	}
	
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
							alt="SiPher Space"
							width={64}
							height={64}
							className="w-16 h-16 cursor-pointer rounded-full antialiased"
						/>
						<p className={"text-center text-xl font-bold antialiased"}>SiPher</p>
					</Link>
				</div>
				<RightSidebarContent
					isDarkMode={isDarkMode}
				/>
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
							<RightSidebarContent
								isDarkMode={isDarkMode}
							/>
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