"use client"

import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
	MoreVerticalIcon,
	PhoneIcon,
	ShieldBanIcon,
	UserMinusIcon,
	UsersIcon,
	VideoIcon,
} from "lucide-react"

export interface FriendActionsMenuProps {
	friendId: string
	onStartCall?: (friendId: string) => void
	onVideoCall?: (friendId: string) => void
	onViewProfile?: (friendId: string) => void
	onRemoveFriend?: (friendId: string) => void
	onBlock?: (friendId: string) => void
}

export function FriendActionsMenu({
	friendId,
	onStartCall,
	onVideoCall,
	onViewProfile,
	onRemoveFriend,
	onBlock,
}: FriendActionsMenuProps) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="size-8 hover:bg-background/80"
					title="More options"
				>
					<MoreVerticalIcon className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-48 p-1" align="end">
				<div className="flex flex-col">
					<Button
						variant="ghost"
						className="justify-start h-9 px-2 font-normal hover:bg-accent"
						onClick={() => onStartCall?.(friendId)}
					>
						<PhoneIcon className="size-4" />
						<span className="text-sm">Start Call</span>
					</Button>
					<Button
						variant="ghost"
						className="justify-start h-9 px-2 font-normal hover:bg-accent"
						onClick={() => onVideoCall?.(friendId)}
					>
						<VideoIcon className="size-4" />
						<span className="text-sm">Start Video Call</span>
					</Button>
					<Button
						variant="ghost"
						className="justify-start h-9 px-2 font-normal hover:bg-accent"
						onClick={() => onViewProfile?.(friendId)}
					>
						<UsersIcon className="size-4" />
						<span className="text-sm">View Profile</span>
					</Button>
					<Separator className="my-1" />
					<Button
						variant="ghost"
						className="justify-start h-9 px-2 font-normal hover:bg-accent text-orange-500 hover:text-orange-600"
						onClick={() => onRemoveFriend?.(friendId)}
					>
						<UserMinusIcon className="size-4" />
						<span className="text-sm">Remove Friend</span>
					</Button>
					<Button
						variant="ghost"
						className="justify-start h-9 px-2 font-normal hover:bg-accent text-red-500 hover:text-red-600"
						onClick={() => onBlock?.(friendId)}
					>
						<ShieldBanIcon className="size-4" />
						<span className="text-sm">Block</span>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}

