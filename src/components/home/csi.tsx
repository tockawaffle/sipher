"use client";

import { cn } from "@/lib/utils";
import { BroadcastIcon as Broadcast } from "@phosphor-icons/react";
import { Activity, Clock, Globe, LogInIcon, LogOutIcon, Radio, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

/**
 * Connection status indicator with popover details
 */
export default function ConnectionStatusIndicator({ socketStatus, socketInfo, disconnectSocket, connectSocket }: { socketStatus: SiPher.SocketStatus; socketInfo: SiPher.SocketInfo; disconnectSocket: () => void; connectSocket: () => void }) {
	const [uptime, setUptime] = useState<string>("0s");
	const [isOpen, setIsOpen] = useState(false);

	// Update uptime every second when connected
	useEffect(() => {
		if (socketStatus !== "connected" || !socketInfo.connectedAt) return;

		const interval = setInterval(() => {
			setUptime(formatUptime(Date.now() - socketInfo.connectedAt!));
		}, 1000);

		// Initial update
		setUptime(formatUptime(Date.now() - socketInfo.connectedAt));

		return () => clearInterval(interval);
	}, [socketStatus, socketInfo.connectedAt]);

	const statusConfig = {
		connected: {
			label: "Connected",
			color: "text-primary",
			glow: "drop-shadow-[0_0_6px_var(--primary)]",
			dotColor: "bg-primary"
		},
		connecting: {
			label: "Connecting",
			color: "text-chart-2",
			glow: "",
			dotColor: "bg-chart-2 animate-pulse"
		},
		disconnected: {
			label: "Disconnected",
			color: "text-muted-foreground",
			glow: "",
			dotColor: "bg-muted-foreground"
		},
		error: {
			label: "Connection Error",
			color: "text-destructive",
			glow: "",
			dotColor: "bg-destructive"
		}
	};

	const config = statusConfig[socketStatus as keyof typeof statusConfig] || statusConfig.error;

	const getPingQuality = (ping: number | null) => {
		if (!ping) return { label: "Unknown", color: "text-muted-foreground" };
		if (ping < 50) return { label: "Excellent", color: "text-primary" };
		if (ping < 100) return { label: "Good", color: "text-chart-1" };
		if (ping < 200) return { label: "Fair", color: "text-chart-2" };
		return { label: "Poor", color: "text-destructive" };
	};

	const pingQuality = getPingQuality(socketInfo.ping);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					className={cn(
						"relative flex items-center justify-center p-1.5 rounded-lg transition-all duration-200",
						"hover:bg-accent/50 active:scale-95",
						config.color, config.glow
					)}
					aria-label="Connection status"
				>
					<Broadcast
						className="size-5"
						weight={socketStatus === "connected" ? "fill" : "regular"}
					/>
					{/* Animated ring for connecting state */}
					{socketStatus === "connecting" && (
						<span className="absolute inset-0 rounded-lg border-2 border-chart-2/50 animate-ping" />
					)}
				</button>
			</PopoverTrigger>

			<PopoverContent
				className={cn(
					"w-72 p-0 overflow-hidden",
					"bg-popover backdrop-blur-xl",
					"border border-border shadow-xl"
				)}
				align="end"
				sideOffset={8}
			>
				{/* Header */}
				<div className="px-4 py-3 border-b border-border">
					<div className="flex items-center gap-3">
						<div className={cn("size-3 rounded-full", config.dotColor)} />
						<div>
							<p className={cn("font-semibold text-sm", config.color)}>{config.label}</p>
							{socketInfo.error && (
								<p className="text-xs text-destructive mt-0.5">{socketInfo.error}</p>
							)}
						</div>
					</div>
				</div>

				{/* Stats Grid */}
				<div className="p-3 space-y-1.5">
					{/* Ping */}
					<div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
						<div className="flex items-center gap-2.5 text-muted-foreground">
							<Activity className="size-4" />
							<span className="text-xs font-medium">Latency</span>
						</div>
						<div className="text-right">
							<span className={cn("text-sm font-mono font-semibold", pingQuality.color)}>
								{socketInfo.ping ? `${socketInfo.ping}ms` : "—"}
							</span>
							<p className={cn("text-[10px]", pingQuality.color)}>{pingQuality.label}</p>
						</div>
					</div>

					{/* Transport */}
					<div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
						<div className="flex items-center gap-2.5 text-muted-foreground">
							<Zap className="size-4" />
							<span className="text-xs font-medium">Transport</span>
						</div>
						<span className="text-sm font-medium capitalize text-foreground">
							{socketInfo.transport || "—"}
						</span>
					</div>

					{/* Uptime */}
					{socketStatus === "connected" && (
						<div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
							<div className="flex items-center gap-2.5 text-muted-foreground">
								<Clock className="size-4" />
								<span className="text-xs font-medium">Uptime</span>
							</div>
							<span className="text-sm font-mono font-medium text-primary">
								{uptime}
							</span>
						</div>
					)}

					{/* Server */}
					{socketInfo.serverUrl && (
						<div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
							<div className="flex items-center gap-2.5 text-muted-foreground">
								<Globe className="size-4" />
								<span className="text-xs font-medium">Server</span>
							</div>
							<span className="text-xs font-mono text-foreground truncate max-w-[120px]">
								{new URL(socketInfo.serverUrl).host}
							</span>
						</div>
					)}

					{/* Socket ID */}
					{socketInfo.socketId && (
						<div className="flex items-center justify-between p-2.5 rounded-md bg-muted/50">
							<div className="flex items-center gap-2.5 text-muted-foreground">
								<Radio className="size-4" />
								<span className="text-xs font-medium">Session</span>
							</div>
							<span className="text-[10px] font-mono text-muted-foreground">
								{socketInfo.socketId.slice(0, 12)}...
							</span>
						</div>
					)}
				</div>

				{/* Footer hint */}
				<div className="flex flex-row items-center justify-between gap-2 px-4 py-2 border-t border-border bg-muted/30">
					<p className="text-[10px] text-muted-foreground text-center">
						Real-time connection via Socket.IO
					</p>
					<Button variant="ghost" size="icon-sm" className="hover:cursor-pointer hover:bg-transparent!" onClick={() => {
						socketStatus === "connected" ? disconnectSocket() : connectSocket();
					}}>
						{
							socketStatus === "connected" ? (
								<LogOutIcon className="size-4" />
							) : (
								<LogInIcon className="size-4" />
							)
						}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}