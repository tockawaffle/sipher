"use client"
import {useTheme} from "next-themes";
import Image from "next/image";
import {Feather, Search} from "lucide-react";
import {useEffect, useState} from "react";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import {Separator} from "@/components/ui/separator";
import Link from "next/link";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import {CryptoManager} from "@/lib/crypto/keys";
import UpdateKey from "@/lib/crypto/helpers/updateKey";

export default function SiPher() {
	const {theme, systemTheme} = useTheme();
	const [mounted, setMounted] = useState(false);
	
	/** CryptoManager Alert */
	const [privateKeyPresent, setPrivateKeyPresent] = useState(true);
	
	/** Consent Form states */
	const [showConsentForm, setShowConsentForm] = useState(false);
	const [formError, setFormError] = useState("");
	
	/** Input states */
	const [inputDisabled, setInputDisabled] = useState(false);
	const [inputValue, setInputValue] = useState("");
	
	/** Search expandability state */
	const [isSearchExpanded, setIsSearchExpanded] = useState(false);
	
	useEffect(() => {
		setMounted(true);
	}, []);
	
	useEffect(() => {
		CryptoManager.getPrivateKey().then((res) => {
			if (!res) {
				console.log(res)
				setPrivateKeyPresent(false);
			}
		})
	}, [])
	
	/**
	 * @param search_term Either the SUUID or username (If not indexable, will return false.)
	 */
	const fetchUser = async (search_term: string) => {
		// Search term cannot be empty
		if (search_term.length <= 0) {
			return false;
		}
		
		// Sends the requisition to the API by using native fetch.
		const req = await fetch(`/api/user/search/user?uuid=${search_term}`);
		
		// Checks if the response is ok (200) or not, if not, returns false.
		if (!req.ok) {
			return false
		}
		
		const user = await req.json() as { exists: boolean };
		// If the user does not exist, just return it
		if (!user.exists) return user.exists;
		
		setShowConsentForm(true); // Shows the confirmation to ask the other user to consent to the communication;
		setInputDisabled(true); // Makes the input disabled until either the user cancels the consent form or accepts it;
		return user.exists; // If everything went right and the user was found, return true
	}
	const sendRequest = async (user: string) => {
		if (user.length <= 0) {
			return false;
		}
		
		const req = await fetch(`/api/user/send/request`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				searchTerm: user, // SUUID or username
			})
		});
		
		if (!req.ok) {
			const res = await req.json();
			setFormError(res.hint);
			return false;
		}
		
		const {sent} = await req.json() as { sent: boolean };
		// If the user does not exist, just return it
		if (!sent) return sent;
		
		return sent;
	}
	
	const getTheme = () => {
		if (!mounted) return "light";
		if (theme === "system") {
			return systemTheme === "dark" ? "dark" : "light";
		}
		return theme === "dark" ? "dark" : "light";
	};
	
	const currentTheme = getTheme();
	
	const MainPageAlerts = () => {
		return (
			<>
				<AlertDialog open={showConsentForm} onOpenChange={(open) => {
					if (!open) setFormError("");
				}}>
					<AlertDialogTrigger/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Consent Form</AlertDialogTitle>
							<AlertDialogDescription className={"flex flex-col space-y-1"}>
								{
									formError ? (
										<span className={"text-red-500"}>{formError}</span>
									) : null
								}
								<span>
								Are you sure you want to contact <span className={"font-bold"}>{inputValue}</span>?
							</span>
								<span>
								By continuing, <span className={"font-bold"}>{inputValue}</span> will receive a notification to accept
								it. If accepted, that user will appear on your sidebar, if rejected, you will never know about it.
							</span>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel
								onClick={() => {
									setShowConsentForm(false);
									setInputDisabled(false);
								}}
							>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={formError.length < 0}
								onClick={() => {
									sendRequest(inputValue);
									setInputDisabled(false);
									setShowConsentForm(false);
								}}
							>Continue</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
				
				<AlertDialog open={!privateKeyPresent}>
					<AlertDialogTrigger/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Private Key Missing</AlertDialogTitle>
							<AlertDialogDescription className={"flex flex-col space-y-1"}>
								<span>This app could not retrieve your private key, which means it's either lost, never stored or corrupted. Want to try again or insert it from a backup?</span>
								<span>You can also regenerate it if you do not have it backed up, but this would mean that you'll loose access to all old messages.</span>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel
								onClick={() => {
									setShowConsentForm(false);
									setInputDisabled(false);
								}}
							>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={() => {
									sendRequest(inputValue).then((result) => {
										if (!result) setFormError("Could not send notification for whatever reason. Sorry.");
									});
									setInputDisabled(false);
								}}
							>Try Again</AlertDialogAction>
							<AlertDialogAction
								onClick={() => {
									UpdateKey().then((result) => {
										if (result.status !== 200) {
											return;
										}
										setPrivateKeyPresent(true)
									})
								}}
							>Regenerate</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		)
	}
	
	return (
		<>
			<MainPageAlerts/>
			
			<div
				className={`relative flex-1 ${currentTheme === "dark" ? "dark" : ""} w-full max-h-[600px] bg-gradient-to-b from-background to-background/95`}>
				<div className="relative flex flex-col justify-center items-center h-screen px-4 select-none space-y-8">
					<div className="relative group">
						<div
							className="absolute inset-0 bg-primary/5 rounded-full blur-xl group-hover:bg-primary/10 transition-all duration-500"/>
						<Image
							priority
							src={`/logos/logo.png`}
							alt="SiPher"
							width={128}
							height={128}
							draggable={false}
							className="relative transform transition-transform duration-500 group-hover:scale-105"
						/>
					</div>
					
					<div className="max-w-2xl space-y-6 text-center">
						<p className="text-lg md:text-xl font-medium leading-relaxed text-primary">
							Where shadows dance and secrets nest, Silent Whisper serves as the dark sanctuary for those
							who value discretion above all. Born from ancient corvid traditions, this messenger&rsquo;s haven ensures
							your
							whispers remain unheard by all but their intended recipients.
						</p>
						
						<p className="text-sm md:text-base font-medium text-muted-foreground leading-relaxed">
							Like the sacred ravens of old, your messages fly through the darkness, their contents sealed by shadows
							and
							protected by forgotten wards. Each member of our dark fellowship is known only by their chosen name, their
							true identity shrouded in mystery.
						</p>
					</div>
					
					<div className="relative mt-8">
						<div
							className={`flex items-center rounded-full transition-all duration-300 ${
								isSearchExpanded
									? "bg-secondary/30 backdrop-blur-sm border border-primary/20 shadow-lg"
									: ""
							}`}
							style={{
								width: isSearchExpanded ? "240px" : "40px",
							}}
						>
							<button
								className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full
                ${currentTheme === "dark" ? "hover:bg-secondary/60" : "hover:bg-primary/10"}
                transition-colors duration-200`}
								onClick={() => setIsSearchExpanded(!isSearchExpanded)}
							>
								<Search className="w-5 h-5"/>
							</button>
							
							<input
								type="text"
								placeholder="Find fellow shadows..."
								className={`w-full bg-transparent focus:outline-none text-primary placeholder-primary/50
                transition-all duration-300 ${isSearchExpanded ? "px-4" : "w-0 px-0"}`}
								disabled={inputDisabled}
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										fetchUser(inputValue).then((res) => {
											console.log(res);
										})
									}
								}}
							/>
						</div>
						
						<Feather
							className={`absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30 transform rotate-45
              transition-opacity duration-300 ${isSearchExpanded ? "opacity-100" : "opacity-0"}`}
						/>
					</div>
					
					<Separator/>
					<div className={"flex flex-col w-[400px]"}>
						<p className="text-lg md:text-xl font-medium leading-relaxed text-primary">
							F.A.Q
						</p>
						<Accordion type={"single"} collapsible className={"w-full-30%"}>
							<AccordionItem value={"works"}>
								<AccordionTrigger>How does this works?</AccordionTrigger>
								<AccordionContent asChild>
									<Link href="/about" className={"text-primary text-lg p-1"}>
										Please, click here
									</Link>
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value={"exists"}>
								<AccordionTrigger>Why does this exists?</AccordionTrigger>
								<AccordionContent>
									I made this as a CS50X final project, hence why it is not intended for real usage. (Do not use it in a
									situation where you need real privacy.)
								</AccordionContent>
							</AccordionItem>
							<AccordionItem value={"os"}>
								<AccordionTrigger>Is this open-source?</AccordionTrigger>
								<AccordionContent>
									No, not yet (As of 11/12/2024)
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</div>
				</div>
			</div>
		</>
	);
}