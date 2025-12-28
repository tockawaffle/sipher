"use client";

import { cn } from "@/lib/utils";
import {
	EarSlash,
	GearSix,
	MicrophoneSlash
} from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";
import { Button } from "../button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../hover-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "../tooltip";

type UserStatus = "online" | "busy" | "offline" | "away";

interface UserFloatingCardProps {
	user: any; // Too lazy to type the user type
	status?: UserStatus;
	activity?: string;
}

const statusColors: Record<UserStatus, string> = {
	online: "bg-emerald-500",
	busy: "bg-red-500",
	away: "bg-yellow-500",
	offline: "bg-muted-foreground"
};

export default function UserFloatingCard(
	{ user }: UserFloatingCardProps
) {
	const [cardOpen, setCardOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const status = useQuery(api.auth.getUserStatus) as {
		status: "online" | "busy" | "offline" | "away";
		isUserSet: boolean;
	} | null;

	// Close when clicking outside the trigger/content
	useEffect(() => {
		if (!cardOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node;
			if (triggerRef.current?.contains(target)) return;
			if (contentRef.current?.contains(target)) return;
			setCardOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, [cardOpen]);

	const controls: {
		key: string;
		icon: React.ReactNode;
		label: string;
		tooltip: string;
		disabled?: boolean;
		onClick?: () => void;
	}[] = [
			{
				key: "mute",
				icon: <MicrophoneSlash size={20} weight="fill" />,
				label: "Mute (soon)",
				tooltip: "Soon",
				disabled: true,
			},
			{
				key: "deafen",
				icon: <EarSlash size={20} weight="fill" />,
				label: "Deafen (soon)",
				tooltip: "Soon",
				disabled: true,
			},
			{
				key: "settings",
				icon: <GearSix size={20} weight="fill" />,
				label: "User Settings",
				tooltip: "Open settings",
				disabled: false,
				onClick: () => {
					// TODO: open user settings modal
					console.info("[UserFloatingCard] open settings modal (stub)");
				}
			},
		];

	return (
		<section
			className="hidden md:flex fixed bottom-0 left-0 z-50 select-none w-(--sidebar-width) px-1 pb-1"
			aria-label="User area"
		>
			<div className="flex w-full max-w-[360px] items-center justify-between gap-2 rounded-xl bg-secondary/90 px-1 py-2 shadow-md border border-border/60 min-h-14 max-h-14">
				{/* Left: avatar + user info with hover card */}
				<HoverCard open={cardOpen} onOpenChange={() => { }}>
					<HoverCardTrigger asChild>
						<Button
							ref={triggerRef}
							variant="ghost"
							size="sm"
							className="flex items-center gap-2 p-1 min-w-0 text-left h-auto bg-transparent hover:bg-muted/50 cursor-pointer"
							onClick={(e) => {
								e.preventDefault();
								setCardOpen((prev) => !prev);
							}}
						>
							<div className="relative shrink-0">
								<Avatar className="size-9 ring-2 ring-border">
									<AvatarImage src={user.image ?? undefined} alt={user.name} />
									<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
										{user.name?.charAt(0).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<span
									className={cn(
										"absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-[3px] border-secondary",
										status ? statusColors[status.status as UserStatus] : "bg-muted-foreground"
									)}
								/>
							</div>

							<div className="flex flex-col min-w-0 leading-tight">
								<div className="flex items-center gap-1 min-w-0">
									<span className="text-[15px] font-semibold text-foreground truncate">
										{user.name}
									</span>
								</div>

								<div className="flex items-center gap-1 text-xs text-muted-foreground/80 truncate italic">
									<span className="text-[14px] leading-none">{"\u2022"}</span>
									<span>Activity status (coming soon)</span>
								</div>

							</div>
						</Button>
					</HoverCardTrigger>
					<HoverCardContent
						ref={contentRef}
						side="top"
						align="start"
						sideOffset={12}
						className="w-64"
					>
						<div className="flex items-center gap-3">
							<Avatar className="size-10 ring-2 ring-border">
								<AvatarImage src={user.image ?? undefined} alt={user.name} />
								<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
									{user.name?.charAt(0).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<div className="flex flex-col min-w-0">
								<span className="text-sm font-semibold text-foreground truncate">{user.name}</span>
								<span className="text-xs text-muted-foreground truncate capitalize">{status?.status}</span>

							</div>
						</div>
					</HoverCardContent>
				</HoverCard>

				{/* Right: controls */}
				<div className="flex items-center gap-1">
					{controls.map((control) => (
						<Tooltip key={control.key}>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									disabled={control.disabled}
									onClick={control.onClick}
									aria-label={control.label}
									className={cn(
										"cursor-pointer",
										control.disabled
											? "bg-muted/50 text-muted-foreground cursor-not-allowed opacity-60"
											: "bg-muted/60 text-foreground hover:bg-muted/70"
									)}
								>
									{control.icon}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">{control.tooltip}</TooltipContent>
						</Tooltip>
					))}
				</div>
			</div>
		</section>
	);
}