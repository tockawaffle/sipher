import {Skeleton} from "@/components/ui/skeleton";
import {ScrollArea} from "@/components/ui/scroll-area";

export default function ChatSkeleton() {
	return (
		<div className="flex flex-col h-screen max-h-[900px] w-full animate-in fade-in-50">
			{/* Header Skeleton */}
			<div className="flex items-center justify-between p-4 border-b">
				<div className="flex items-center space-x-4">
					<Skeleton className="h-10 w-10 rounded-full"/>
					<Skeleton className="h-4 w-32"/>
				</div>
				<div className="flex items-center space-x-2">
					<Skeleton className="h-9 w-9 rounded-md"/>
					<Skeleton className="h-9 w-9 rounded-md"/>
				</div>
			</div>
			
			{/* Messages Skeleton */}
			<ScrollArea className="flex-1 p-4">
				<div className="space-y-4">
					{/* Left message */}
					<div className="flex justify-start">
						<Skeleton className="h-16 w-[250px] rounded-lg"/>
					</div>
					{/* Right message */}
					<div className="flex justify-end">
						<Skeleton className="h-12 w-[200px] rounded-lg"/>
					</div>
					{/* Left message */}
					<div className="flex justify-start">
						<Skeleton className="h-20 w-[300px] rounded-lg"/>
					</div>
					{/* Right message */}
					<div className="flex justify-end">
						<Skeleton className="h-14 w-[180px] rounded-lg"/>
					</div>
				</div>
			</ScrollArea>
			
			{/* Input Area Skeleton */}
			<div className="p-4 border-t">
				<div className="flex space-x-2">
					<Skeleton className="h-10 flex-1 rounded-md"/>
					<Skeleton className="h-10 w-10 rounded-md"/>
				</div>
			</div>
		</div>
	);
}