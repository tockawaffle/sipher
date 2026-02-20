/**
 * Browser Notification System
 * Handles both unread counts and native browser notifications
 */

// Track which channel the user is currently viewing
let activeChannelId: string | null = null;

/**
 * Set the currently active channel
 * Messages in this channel won't trigger notifications or increment unread
 */
export function setActiveChannel(channelId: string | null) {
	activeChannelId = channelId;
	console.debug("[Notifications] Active channel set to:", channelId);
}

/**
 * Get the currently active channel
 */
export function getActiveChannel(): string | null {
	return activeChannelId;
}

/**
 * Check if user is currently viewing a specific channel
 */
export function isChannelActive(channelId: string): boolean {
	return activeChannelId === channelId;
}

/**
 * Request browser notification permission
 * Should be called on user interaction (button click, etc.)
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!("Notification" in window)) {
		console.warn("[Notifications] Browser doesn't support notifications");
		return "denied";
	}

	if (Notification.permission === "granted") {
		return "granted";
	}

	if (Notification.permission !== "denied") {
		const permission = await Notification.requestPermission();
		console.log("[Notifications] Permission:", permission);
		return permission;
	}

	return Notification.permission;
}

/**
 * Check if notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
	return "Notification" in window && Notification.permission === "granted";
}

/**
 * Show a browser notification for a new message
 */
export function showMessageNotification(options: {
	senderName: string;
	senderImage?: string;
	messagePreview: string;
	channelId: string;
	userStatus?: "online" | "busy" | "offline" | "away"; // Current user's status
	onClick?: () => void;
}) {
	// Don't show notification if user status is "busy"
	if (options.userStatus === "busy") {
		console.debug("[Notifications] Skipping notification - user is busy");
		return;
	}

	// Don't show notification if user is viewing this channel
	if (isChannelActive(options.channelId)) {
		console.debug("[Notifications] Skipping notification - channel is active");
		return;
	}

	// Don't show if notifications not enabled
	if (!areNotificationsEnabled()) {
		console.debug("[Notifications] Skipping notification - not enabled");
		return;
	}

	// Don't show if page is focused (user is actively using the app)
	if (document.hasFocus()) {
		console.debug("[Notifications] Skipping notification - page has focus");
		return;
	}

	try {
		const notification = new Notification(`${options.senderName}`, {
			body: options.messagePreview,
			icon: options.senderImage || "/default-avatar.png",
			badge: "/logo.png",
			tag: options.channelId, // Prevents duplicate notifications for same channel
			requireInteraction: false,
			silent: false,
		});

		notification.onclick = () => {
			window.focus();
			notification.close();
			options.onClick?.();
		};

		// Auto-close after 5 seconds
		setTimeout(() => notification.close(), 5000);

		console.log("[Notifications] Browser notification shown");
	} catch (error) {
		console.error("[Notifications] Failed to show notification:", error);
	}
}

/**
 * Play a notification sound (optional)
 */
export function playNotificationSound() {
	try {
		const audio = new Audio("/notification.mp3");
		audio.volume = 0.5;
		audio.play().catch((err) => {
			console.debug("[Notifications] Failed to play sound:", err);
		});
	} catch (error) {
		console.debug("[Notifications] Audio not available");
	}
}
