import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../avatar";

export default function UserCard({ userName, image, status, size = "medium" }: { userName: string, image: string | undefined, status: "online" | "busy" | "offline" | "away" | "none", size?: "small" | "medium" | "large" }) {

	const statusColors: Record<"online" | "busy" | "offline" | "away", string> = {
		online: "bg-emerald-500",
		busy: "bg-red-500",
		away: "bg-yellow-500",
		offline: "bg-muted-foreground",
	};

	const sizes: Record<"small" | "medium" | "large", string> = {
		small: "size-4",
		medium: "size-8",
		large: "size-9",
	};

	return (
		<div className="relative shrink-0">
			<Avatar className={cn("ring-2 ring-border", sizes[size])}>
				<AvatarImage src={image ?? undefined} alt={userName} />
				<AvatarFallback className="bg-primary/20 text-primary-foreground font-semibold">
					{userName?.charAt(0).toUpperCase()}
				</AvatarFallback>
			</Avatar>
			{
				status !== "none" && (
					<span
						className={cn(
							"absolute -bottom-0.5 -right-0.5 size-2 rounded-full border-2 border-secondary",
							status ? statusColors[status] : "bg-muted-foreground"
						)}
					/>
				)
			}
		</div>
	)
}