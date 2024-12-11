"use client"
import React from 'react'
import {Button} from "@/components/ui/button"
import {HamburgerMenuIcon} from "@radix-ui/react-icons"
import {useTheme} from "next-themes"
import Image from "next/image"
import {useUIState} from "@/hooks/shared-states"
import Link from "next/link";

const MobileHeader: React.FC = () => {
	const {setIsDrawerOpen} = useUIState()
	const {theme, systemTheme} = useTheme()
	
	const getTheme = () => {
		if (theme === "system") {
			switch (systemTheme) {
				case "dark":
					return "dark"
				default:
					return "light"
			}
		}
		return theme === "dark" ? "dark" : "light"
	}
	
	const logoSrc = getTheme() === 'dark' ? '/logos/logo-light.png' : '/logos/logo.png'
	
	return (
		<header className="fixed top-0 left-0 right-0 z-50 lg:hidden pb-10">
			<div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setIsDrawerOpen(true)}
					className="rounded-full"
				>
					<HamburgerMenuIcon className="w-6 h-6"/>
				</Button>
				
				<div className="flex items-center justify-center flex-1">
					<Link href="/" className="block">
						<Image
							src={logoSrc}
							alt="Logo"
							width={48}
							height={48}
							className="w-12 h-12 cursor-pointer rounded-full hover:bg-secondary/20"
						/>
					</Link>
				</div>
				
				{/* Empty div to maintain center alignment */}
				<div className="w-10 mb-8"/>
			</div>
		</header>
	)
}

export default MobileHeader