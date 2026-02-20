"use client";

import { requestNotificationPermission } from "@/lib/notifications";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";

export function NotificationSettings({ userStatus }: { userStatus: "online" | "busy" | "offline" | "away" }) {
	const [permission, setPermission] = useState<NotificationPermission>("default");
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if ("Notification" in window) {
			setPermission(Notification.permission);
		}
	}, []);

	const handleRequestPermission = async () => {
		setIsLoading(true);
		try {
			const newPermission = await requestNotificationPermission();
			setPermission(newPermission);

			if (newPermission === "granted") {
				if (userStatus === "busy") return;
				// Show a test notification
				new Notification("Notifications enabled!", {
					body: "You'll now receive message notifications",
					icon: "/logo.png",
				});
			}
		} catch (error) {
			console.error("Failed to request notification permission:", error);
		} finally {
			setIsLoading(false);
		}
	};

	if (!("Notification" in window)) {
		return null; // Browser doesn't support notifications
	}

	if (permission === "granted") {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Bell className="h-4 w-4 text-green-500" />
				<span>Notifications enabled</span>
			</div>
		);
	}

	if (permission === "denied") {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<BellOff className="h-4 w-4 text-red-500" />
				<span>Notifications blocked. Enable in browser settings.</span>
			</div>
		);
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={handleRequestPermission}
			disabled={isLoading}
			className="gap-2"
		>
			<Bell className="h-4 w-4" />
			{isLoading ? "Requesting..." : "Enable Notifications"}
		</Button>
	);
}

/**
 * Auto-request notification permission component
 * Place in your app layout to automatically request permission on load
 */
export function AutoRequestNotifications() {
	useEffect(() => {
		if ("Notification" in window && Notification.permission === "default") {
			// Auto-request permission after a short delay (to not interrupt page load)
			const timer = setTimeout(async () => {
				try {
					const permission = await requestNotificationPermission();
					if (permission === "granted") {
						console.log("[Notifications] Permission granted automatically");
					}
				} catch (error) {
					console.debug("[Notifications] Auto-request failed or was dismissed:", error);
				}
			}, 2000); // Wait 2 seconds after page load

			return () => clearTimeout(timer);
		}
	}, []);

	return null; // This component doesn't render anything
}
