"use client"
import {motion} from "framer-motion";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger,} from "@/components/ui/accordion";
import {Separator} from "@/components/ui/separator";
import {AlertTriangle, KeyRound, Lock, MessageSquare, Shield, UserCheck,} from "lucide-react";

export default function AboutPage() {
	const containerVariants = {
		hidden: {opacity: 0},
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.1
			}
		}
	};
	
	const itemVariants = {
		hidden: {opacity: 0, y: 20},
		visible: {opacity: 1, y: 0}
	};
	
	return (
		<motion.div
			className="container max-w-4xl mx-auto py-8 px-4 space-y-8"
			initial="hidden"
			animate="visible"
			variants={containerVariants}
		>
			<motion.div variants={itemVariants} className="text-center space-y-4">
				<h1 className="text-4xl font-bold">About SiPher</h1>
				<p className="text-lg text-muted-foreground">
					Where privacy meets simplicity in secure communication
				</p>
			</motion.div>
			
			<Separator/>
			
			<motion.div variants={itemVariants}>
				<Alert variant="destructive">
					<AlertTriangle className="h-4 w-4"/>
					<AlertTitle>Important Notice</AlertTitle>
					<AlertDescription>
						SiPher is a CS50X final project and is not intended for production use.
						While we implement strong encryption, please do not use it for sensitive communications.
					</AlertDescription>
				</Alert>
			</motion.div>
			
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle>How SiPher Works</CardTitle>
						<CardDescription>
							Understanding the security behind your messages
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="flex items-start space-x-3">
								<KeyRound className="h-6 w-6 text-primary mt-1"/>
								<div>
									<h3 className="font-semibold">Key Generation</h3>
									<p className="text-sm text-muted-foreground">
										Each user has a unique public-private key pair generated in their browser. Lost it and didn&apos;t
										make a
										backup? Welp, skill issue I guess.
									</p>
								</div>
							</div>
							
							<div className="flex items-start space-x-3">
								<Lock className="h-6 w-6 text-primary mt-1"/>
								<div>
									<h3 className="font-semibold">End-to-End Encryption</h3>
									<p className="text-sm text-muted-foreground">
										Messages are encrypted before leaving your device
									</p>
								</div>
							</div>
							
							<div className="flex items-start space-x-3">
								<Shield className="h-6 w-6 text-primary mt-1"/>
								<div>
									<h3 className="font-semibold">Zero (And A Half) Trust</h3>
									<p className="text-sm text-muted-foreground">
										Server never sees your decrypted messages. But we do store their encrypted version though lmao.
									</p>
								</div>
							</div>
							
							<div className="flex items-start space-x-3">
								<UserCheck className="h-6 w-6 text-primary mt-1"/>
								<div>
									<h3 className="font-semibold">User Privacy</h3>
									<p className="text-sm text-muted-foreground">
										Users are identified by unique IDs, not personal information. No e-mail, no nothing, only your ID
										(and probably IP due to Supabase logging it)
									</p>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</motion.div>
			
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle>Technical Details</CardTitle>
						<CardDescription>
							The technology powering SiPher&apos;s &quot;security&quot;
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<h3 className="font-semibold">Encryption</h3>
							<ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
								<li>RSA-OAEP for key exchange</li>
								<li>AES-GCM for message encryption</li>
								<li>PBKDF2 for key derivation</li>
								<li>SHA-256 for message integrity</li>
							</ul>
						</div>
						
						<div className="space-y-2">
							<h3 className="font-semibold">Implementation</h3>
							<ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
								<li>Web Crypto API for cryptographic operations</li>
								<li>Next.js for the application framework</li>
								<li>Supabase for real-time messaging</li>
								<li>TailwindCSS and ShadcnUI for the interface (I suck at design)</li>
							</ul>
						</div>
					</CardContent>
				</Card>
			</motion.div>
			
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle>Frequently Asked Questions</CardTitle>
					</CardHeader>
					<CardContent>
						<Accordion type="single" collapsible className="w-full">
							<AccordionItem value="item-1">
								<AccordionTrigger>How secure are my messages?</AccordionTrigger>
								<AccordionContent>
									Messages are encrypted using industry-standard algorithms and never stored in plaintext.
									However, as this is an educational project, I recommend not using it for sensitive communications.
									If you do and I get a notice, I will give out the data I have on you. I don&apos;t care.
								</AccordionContent>
							</AccordionItem>
							
							<AccordionItem value="item-2">
								<AccordionTrigger>What happens if I lose my private key?</AccordionTrigger>
								<AccordionContent>
									If you lose your private key, you won&apos;t be able to decrypt previous messages.
									You can generate a new key pair, but you&apos;ll need to start fresh conversations, previous messages
									from
									other conversations will be lost forever.
									Always backup your private key in the settings.
								</AccordionContent>
							</AccordionItem>
							
							<AccordionItem value="item-3">
								<AccordionTrigger>Can I recover deleted messages?</AccordionTrigger>
								<AccordionContent>
									You can&apos;t even delete chats, imagine messages lmao.
								</AccordionContent>
							</AccordionItem>
							
							<AccordionItem value="item-4">
								<AccordionTrigger>How do I verify a user&apos;s identity?</AccordionTrigger>
								<AccordionContent>
									Each user has a unique SUUID (Short UUID) that can be shared and verified.
									You can verify a user&apos;s identity by comparing their SUUID in a secure channel.
								</AccordionContent>
							</AccordionItem>
							
							<AccordionItem value="item-5">
								<AccordionTrigger>Is SiPher open source?</AccordionTrigger>
								<AccordionContent>
									Not yet. As this is a CS50X final project, the code will be made available
									for educational purposes in the future.
								</AccordionContent>
							</AccordionItem>
							
							<AccordionItem value="item-5">
								<AccordionTrigger>Will you continue this project after submitting it?</AccordionTrigger>
								<AccordionContent>
									Probably. It&apos;s quite fun dealing with encryption.
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</CardContent>
				</Card>
			</motion.div>
			
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle>Message Flow</CardTitle>
						<CardDescription>
							How your message travels from you to the other user
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative flex justify-between items-center py-8">
							<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
								<MessageSquare className="w-6 h-6 text-primary"/>
							</div>
							<div className="absolute left-[calc(50%-4px)] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary"/>
							<div className="absolute left-[20%] right-[20%] top-1/2 -translate-y-1/2 h-0.5 bg-primary/20"/>
							<div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
								<Lock className="w-6 h-6 text-primary"/>
							</div>
						</div>
						<p className="text-sm text-center text-muted-foreground">
							Messages are encrypted on your device before being sent through our servers,
							ensuring end-to-end encryption for all communications.
						</p>
					</CardContent>
				</Card>
			</motion.div>
			
			<motion.div variants={itemVariants} className="text-center text-sm text-muted-foreground">
				<p>Built with 💖 as a CS50X final project</p>
			</motion.div>
		</motion.div>
	);
}