"use client"
import {motion} from "framer-motion";
import {useTheme} from "next-themes";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Switch} from "@/components/ui/switch";
import {Separator} from "@/components/ui/separator";
import {useUser} from "@/contexts/user";
import {useState} from "react";
import {AlertTriangle, Copy, Download, Eye, EyeOff, Key, Lock, Save, User} from "lucide-react";
import {CryptoManager} from "@/lib/crypto/keys";
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";

export default function SettingsPage() {
	const {theme, setTheme} = useTheme();
	const {user} = useUser();
	const [loading, setLoading] = useState(false);
	const [privateKeyVisible, setPrivateKeyVisible] = useState(false);
	const [privateKeyData, setPrivateKeyData] = useState<{ text: string; file: File } | null>(null);
	const [backupError, setBackupError] = useState("");
	
	const containerVariants = {
		hidden: {opacity: 0, y: 20},
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.6,
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
			className="flex-1 space-y-8 p-8 pt-6"
			initial="hidden"
			animate="visible"
			variants={containerVariants}
		>
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Settings</h2>
					<p className="text-muted-foreground">
						Manage your account settings and preferences
					</p>
				</div>
			</div>
			
			<Tabs defaultValue="profile" className="space-y-6">
				<TabsList className="w-full justify-start">
					<TabsTrigger value="profile" className="flex items-center gap-2">
						<User size={16}/>
						Profile
					</TabsTrigger>
					<TabsTrigger value="privacy" className="flex items-center gap-2">
						<Lock size={16}/>
						Privacy
					</TabsTrigger>
				</TabsList>
				
				<motion.div variants={itemVariants}>
					<TabsContent value="profile" className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle>Profile Information</CardTitle>
								<CardDescription>
									Update your profile information and settings
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="username">Username</Label>
									<Input
										id="username"
										defaultValue={user.username}
										placeholder="Your username"
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="suuid">Your SUUID</Label>
									<div className="flex gap-2">
										<Input
											id="suuid"
											value={user.suuid}
											readOnly
											className="font-mono"
										/>
										<Button
											onClick={() => {
												navigator.clipboard.writeText(user.suuid);
											}}
											variant="outline"
										>
											Copy
										</Button>
									</div>
								</div>
							</CardContent>
						</Card>
					</TabsContent>
					
					<TabsContent value="privacy" className="space-y-4">
						<Card>
							<CardHeader>
								<CardTitle>Privacy Settings</CardTitle>
								<CardDescription>
									Manage your privacy and security preferences
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="flex items-center justify-between">
									<div className="space-y-1">
										<Label>Message Encryption</Label>
										<p className="text-sm text-muted-foreground">
											End-to-end encryption is always enabled
										</p>
									</div>
									<Key className="h-4 w-4 text-primary"/>
								</div>
								<Separator/>
								<div className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-1">
											<Label>Private Key Backup</Label>
											<p className="text-sm text-muted-foreground">
												View and download your private key for backup
											</p>
										</div>
										<div className="flex gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													try {
														const data = await CryptoManager.exportPrivateKey();
														if (data) {
															setPrivateKeyData(data);
															setBackupError("");
														} else {
															setBackupError("Failed to export private key");
														}
													} catch (error) {
														setBackupError("Error accessing private key");
													}
												}}
											>
												<Eye className="h-4 w-4 mr-2"/>
												View Key
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={async () => {
													try {
														const data = await CryptoManager.exportPrivateKey();
														if (data) {
															const url = URL.createObjectURL(data.file);
															const a = document.createElement('a');
															a.href = url;
															a.download = data.file.name;
															document.body.appendChild(a);
															a.click();
															document.body.removeChild(a);
															URL.revokeObjectURL(url);
															setBackupError("");
														} else {
															setBackupError("Failed to download private key");
														}
													} catch (error) {
														setBackupError("Error downloading private key");
													}
												}}
											>
												<Download className="h-4 w-4 mr-2"/>
												Download
											</Button>
										</div>
									</div>
									
									{backupError && (
										<Alert variant="destructive">
											<AlertTriangle className="h-4 w-4"/>
											<AlertTitle>Error</AlertTitle>
											<AlertDescription>{backupError}</AlertDescription>
										</Alert>
									)}
									
									{privateKeyData && (
										<Card className="mt-4 w-full">
											<CardHeader className="py-3">
												<div className="flex justify-between items-center">
													<CardTitle className="text-sm">Private Key</CardTitle>
													<div className="flex gap-2">
														<Button
															size="sm"
															variant="ghost"
															onClick={() => {
																navigator.clipboard.writeText(privateKeyData.text);
															}}
														>
															<Copy className="h-4 w-4"/>
														</Button>
														<Button
															size="sm"
															variant="ghost"
															onClick={() => {
																setPrivateKeyData(null);
																setPrivateKeyVisible(false);
															}}
														>
															<EyeOff className="h-4 w-4"/>
														</Button>
													</div>
												</div>
											</CardHeader>
											<CardContent>
												<div className="max-w-full overflow-hidden rounded-lg bg-secondary/50">
                          <pre className="p-4 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                            {privateKeyData.text}
                          </pre>
												</div>
											</CardContent>
										</Card>
									)}
								</div>
								<Separator/>
								<div className="flex items-center justify-between">
									<div className="space-y-1">
										<Label>Allow Message Requests</Label>
										<p className="text-sm text-muted-foreground">
											Receive message requests from other users
										</p>
									</div>
									<Switch defaultChecked/>
								</div>
							</CardContent>
						</Card>
						
						<Alert>
							<AlertTriangle className="h-4 w-4"/>
							<AlertTitle>Private Key Management</AlertTitle>
							<AlertDescription>
								Your private key is stored securely in your browser.
								Make sure to back it up to avoid losing access to your messages.
							</AlertDescription>
						</Alert>
					</TabsContent>
				</motion.div>
			</Tabs>
			
			<motion.div
				variants={itemVariants}
				className="flex justify-end"
			>
				<Button
					className="w-32"
					disabled={loading}
					onClick={() => {
						setLoading(true);
						// Simulate saving
						setTimeout(() => setLoading(false), 1000);
					}}
				>
					{loading ? (
						<motion.div
							animate={{rotate: 360}}
							transition={{duration: 1, repeat: Infinity, ease: "linear"}}
						>
							<Save className="h-4 w-4 mr-2"/>
						</motion.div>
					) : (
						"Save Changes"
					)}
				</Button>
			</motion.div>
		</motion.div>
	);
}