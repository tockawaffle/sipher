import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "../ui/button";

/**
 * Discord-style sidebar icon with pill indicator
 */
export default function SidebarIcon({
	children,
	isActive,
	isHome,
	label,
	onClick
}: {
	children: React.ReactNode;
	isActive?: boolean;
	isHome?: boolean;
	label?: string;
	onClick?: () => void;
}) {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<div className="relative flex items-center justify-center w-full group">
			{/* Left pill indicator */}
			<div
				className={cn(
					"absolute left-0 w-1 bg-sidebar-foreground rounded-r-full transition-all duration-200",
					isActive ? "h-10" : isHovered ? "h-5" : "h-0"
				)}
			/>

			{/* Icon button */}
			<Button
				type="button"
				variant="ghost"
				size="icon-xl"
				onClick={onClick}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				className={cn(
					"relative flex items-center justify-center size-12 transition-all duration-200 overflow-hidden",
					"focus-visible:ring-0 focus-visible:border-none",
					isHome
						? "bg-primary text-primary-foreground hover:bg-primary/80"
						: "bg-sidebar hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-foreground",
					isActive
						? "rounded-2xl bg-primary text-primary-foreground"
						: "rounded-[24px] hover:rounded-2xl"
				)}
			>
				{children}
			</Button>

			{/* Tooltip */}
			{label && (
				<div className={cn(
					"absolute left-full ml-3 px-3 py-2 bg-popover text-popover-foreground text-sm font-medium rounded-md shadow-lg whitespace-nowrap z-50 pointer-events-none transition-all duration-150",
					isHovered ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-1"
				)}>
					{label}
					<div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-popover" />
				</div>
			)}
		</div>
	);
}