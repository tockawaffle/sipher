"use client"
import {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {useTheme} from 'next-themes';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Avatar, AvatarFallback} from '@/components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from '@/components/ui/tooltip';
import {
	Archive,
	Ban,
	Clock,
	Download,
	Info,
	Key,
	KeyRound,
	MoreVertical,
	Send,
	ShieldCheck,
	UserCheck,
	UserX
} from 'lucide-react';
import {usePathname} from "next/navigation";
import {useUser} from "@/contexts/user";
import {useToast} from "@/hooks/use-toast";
import {useSharedState} from "@/hooks/shared-states";
import {createBrowserClient} from '@/lib/supabase/browser'
import {CryptoManager} from "@/lib/crypto/keys";
import {REALTIME_SUBSCRIBE_STATES} from "@supabase/realtime-js";

export default function ChatPage() {
	const {theme} = useTheme();
	const {toast} = useToast();
	const supabase = createBrowserClient();
	
	const [messages, setMessages] = useState<SiPher.Thread["messages"]>([]);
	const [inputMessage, setInputMessage] = useState('');
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [showKeyDialog, setShowKeyDialog] = useState(false);
	const [showUserDialog, setShowUserDialog] = useState(false);
	const [isEncrypted, setIsEncrypted] = useState(true);
	
	const [realtimeSubscribed, setRealtimeSubscribed] = useState<REALTIME_SUBSCRIBE_STATES>()
	
	const [isLoaded, setIsLoaded] = useState<boolean>(false);
	
	const [user, setUser] = useState<SiPher.User | null>(null);
	const pathName = usePathname();
	const threadId = pathName.replace("/", "");
	
	const {
		user: currentUser,
		getUser
	} = useUser()
	
	const {threads} = useSharedState();
	
	useEffect(() => {
		const channel = supabase
			.channel(`messages:${threadId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'messages',
				},
				async (payload) => {
					if (payload.eventType === "INSERT") {
						const messageData = payload.new as SiPher.RealtimeMessageData;
						const isSender = messageData.sender_uuid === currentUser.uuid;
						
						const decryptedMsg = await CryptoManager.decryptMessage(messageData.sender_content)
						console.log(`Hello there`)
						setMessages((prevState) => {
							return [
								...prevState,
								{
									id: messageData.id,
									content: decryptedMsg,
									sender_uuid: messageData.sender_uuid,
									created_at: messageData.created_at,
									isSender
								}
							]
						})
					}
				}
			)
			.subscribe((status) => {
				setRealtimeSubscribed(status)
				console.log('Realtime subscription status:', status)
			})
		
		return () => {
			supabase.removeChannel(channel)
		}
	}, [threadId])
	
	useEffect(() => {
		const getUserDataAndChat = async () => {
			const {thread: getThread} = await (await fetch(`/api/user/get/thread?threadId=${threadId}`)).json() as {
				thread: SiPher.Thread
			};
			
			const otherUser = getThread.participant_suuids.filter((ids) => ids !== currentUser.suuid);
			const user = await getUser(`Being called from chat page (${threadId}`, otherUser[0], "suuid", true)
			
			if (!(user.user[0].suuid && user.user[0].username)) {
				toast({
					title: "Error",
					description: "Could not verify the existence of this user",
					variant: "destructive",
					duration: 5000
				});
			}
			
			setUser(user.user[0])
			
			const decryptedMsg = await CryptoManager.decryptThreadMessages(getThread["messages"], currentUser.uuid)
			setMessages(decryptedMsg)
		}
		
		if (threads.length > 0) {
			setIsLoaded(true)
			getUserDataAndChat()
		}
		
		return () => {
			setUser(null)
			setMessages([])
			setIsLoaded(false)
		}
	}, [setUser, setMessages, setIsLoaded, threads])
	
	if (!isLoaded || !user || realtimeSubscribed !== "SUBSCRIBED") {
		return (
			<>
				a
			</>
		)
	}
	
	// Mock functions - replace with actual implementations
	const checkUserValidity = async () => {
		// Implementation for checking user validity
		setShowUserDialog(true);
	};
	
	const checkCurrentKey = async () => {
		// Implementation for checking current key
		setShowKeyDialog(true);
	};
	
	const deleteUser = async () => {
		// Implementation for deleting user
		setShowDeleteDialog(true);
	};
	
	const sendMessage = async (content: string) => {
		if (!content.trim()) return;
		setInputMessage('');
		
		await CryptoManager.prepareAndSendMessage(
			content,
			currentUser.public_key,
			user.public_key,
			threadId
		)
		
	};
	
	return (
		<div className="flex flex-col h-screen max-h-[900px] w-full">
			{/* Chat Header */}
			<div className="flex items-center justify-between p-4 border-b">
				<div className="flex items-center space-x-4">
					<Avatar>
						<AvatarFallback>
							{
								user.username.charAt(0).toLocaleUpperCase()
							}
						</AvatarFallback>
					</Avatar>
					<div>
						<h2 className="font-semibold">
							{
								user.username.charAt(0).toLocaleUpperCase() + user.username.slice(1)
							}
						</h2>
					</div>
				</div>
				
				<div className="flex items-center space-x-2">
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button variant="ghost" size="icon" className="text-primary">
									{isEncrypted ? <ShieldCheck className="h-5 w-5"/> : <Ban className="h-5 w-5"/>}
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								{isEncrypted ? 'Encrypted Chat' : 'Encryption Issue'}
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
					
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon">
								<MoreVertical className="h-5 w-5"/>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel>Chat Options</DropdownMenuLabel>
							<DropdownMenuSeparator/>
							
							<DropdownMenuItem onClick={checkUserValidity}>
								<UserCheck className="mr-2 h-4 w-4"/>
								<span>Check User</span>
							</DropdownMenuItem>
							
							<DropdownMenuItem onClick={checkCurrentKey}>
								<Key className="mr-2 h-4 w-4"/>
								<span>Check Current Key</span>
							</DropdownMenuItem>
							
							<DropdownMenuSeparator/>
							
							<DropdownMenuItem>
								<Clock className="mr-2 h-4 w-4"/>
								<span>Message History</span>
							</DropdownMenuItem>
							
							<DropdownMenuItem>
								<Archive className="mr-2 h-4 w-4"/>
								<span>Archive Chat</span>
							</DropdownMenuItem>
							
							<DropdownMenuItem>
								<Download className="mr-2 h-4 w-4"/>
								<span>Export Chat</span>
							</DropdownMenuItem>
							
							<DropdownMenuSeparator/>
							
							<DropdownMenuItem onClick={deleteUser} className="text-red-500">
								<UserX className="mr-2 h-4 w-4"/>
								<span>Delete User</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			
			{/* Chat Messages */}
			<ScrollArea className="flex-1 p-4">
				<div className="space-y-4">
					<AnimatePresence>
						{messages.map((message) => (
							<motion.div
								key={message.id}
								initial={{opacity: 0, y: 20}}
								animate={{opacity: 1, y: 0}}
								exit={{opacity: 0}}
								className={`flex ${message.isSender ? 'justify-end' : 'justify-start'}`}
							>
								<div className={`max-w-[70%] rounded-lg p-3 ${
									message.isSender
										? 'bg-primary text-primary-foreground'
										: 'bg-secondary'
								}`}>
									<p>{message.content}</p>
									<div className="flex items-center justify-end space-x-1 mt-1">
                    <span className="text-xs opacity-70">
                      {new Date(message.created_at).toLocaleTimeString([], {
	                      hour: '2-digit',
	                      minute: '2-digit'
                      })}
                    </span>
									</div>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>
			</ScrollArea>
			
			{/* Input Area */}
			<div className="p-4 border-t">
				<div className="flex space-x-2">
					<Input
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						placeholder="Type a message..."
						onKeyDown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								sendMessage(inputMessage);
							}
						}}
					/>
					<Button onClick={() => sendMessage(inputMessage)}>
						<Send className="h-4 w-4"/>
					</Button>
				</div>
			</div>
			
			{/* Dialogs */}
			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete User</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this user? This will remove them from your contacts
							and delete all messages. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction className="bg-red-500">Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			
			<AlertDialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Encryption Status</AlertDialogTitle>
						<AlertDialogDescription className="space-y-4">
							<div className="flex items-center space-x-2">
								<KeyRound className="h-4 w-4 text-green-500"/>
								<span>Local private key is valid and active</span>
							</div>
							<div className="flex items-center space-x-2">
								<Key className="h-4 w-4 text-green-500"/>
								<span>Remote public key is verified</span>
							</div>
							<div className="flex items-center space-x-2">
								<ShieldCheck className="h-4 w-4 text-green-500"/>
								<span>End-to-end encryption is active</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction>Close</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			
			<AlertDialog open={showUserDialog} onOpenChange={setShowUserDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>User Verification</AlertDialogTitle>
						<AlertDialogDescription className="space-y-4">
							<div className="flex items-center space-x-2">
								<UserCheck className="h-4 w-4 text-green-500"/>
								<span>User is verified and active</span>
							</div>
							<div className="flex items-center space-x-2">
								<Info className="h-4 w-4"/>
								<span>Last active: 2 minutes ago</span>
							</div>
							<div className="flex items-center space-x-2">
								<ShieldCheck className="h-4 w-4 text-green-500"/>
								<span>Secure connection established</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogAction>Close</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}