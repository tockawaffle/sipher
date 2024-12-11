"use client"

import React, {useCallback, useEffect, useState} from 'react'
import Image from 'next/image'
import {motion} from 'framer-motion'
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Label} from "@/components/ui/label"
import {Card, CardContent} from "@/components/ui/card"
import {EyeIcon, EyeOffIcon} from 'lucide-react'
import {useToast} from "@/hooks/use-toast"
import {ToastActionElement} from "@/components/ui/toast";
import {useUser} from "@/contexts/user";
import {useRouter} from "next/navigation";
import {useTheme} from "next-themes";
import Register from "@/app/auth/login/register";
import Login from "@/app/auth/login/login";

export default function AuthPage() {
	const {checkAuth} = useUser();
	const {theme, systemTheme} = useTheme()
	const {toast} = useToast();
	const [mounted, setMounted] = useState(false);
	const [isLogin, setIsLogin] = useState(true);
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const router = useRouter();
	
	const check = useCallback(async () => {
		const isAuthenticated = await checkAuth("Called on Login page");
		if (isAuthenticated) {
			router.replace('/');
		} else {
			setMounted(true);
		}
	}, [checkAuth, router, setMounted])
	
	useEffect(() => {
		check().then(() => {
			console.log("Login page check finished")
		})
	}, []);
	
	if (!mounted) {
		return <div className="min-h-screen flex items-center justify-center">
			{/* Optional: Add a loading spinner or skeleton here */}
		</div>;
	}
	
	
	const getTheme = () => {
		if (theme === "system") {
			switch (systemTheme) {
				case "dark":
					return "dark"
				default:
					return "light"
			}
		}
		
		return theme === "dark" ? "dark" : "light"
	}
	
	const logoSrc = getTheme() === 'dark' ? '/logos/logo-light.png' : '/logos/logo.png';
	
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsSubmitting(true);
		
		const username = (document.getElementById('username') as HTMLInputElement).value;
		const password = (document.getElementById('password') as HTMLInputElement).value;
		
		let response: {
			code: number;
			message: string;
			action?: ToastActionElement | undefined;
		}
		if (!isLogin) {
			response = await Register(username, password);
		} else {
			response = await Login(username, password);
		}
		
		if (response.code !== 200) {
			const msg = response.message
			
			try {
				const parsed = JSON.parse(msg);
				let desc = parsed.name;
				
				switch (desc) {
					case "AuthWeakPasswordError": {
						desc = "Password too weak, please try again.";
						break;
					}
					default: {
						desc = "An unknown error occurred";
					}
				}
				
				toast({
					title: "Error",
					description: desc,
					variant: "destructive",
					duration: 5000
				});
			} catch (e) {
				// If msg isn't valid JSON, show the raw message
				toast({
					title: "Error",
					description: msg,
					variant: "destructive",
					duration: 5000
				});
			}
		} else {
			toast({
				title: "Success",
				description: response.message,
				variant: "default",
				duration: 5000, // Increased duration for better visibility
			});
			window.location.href = "/";
		}
		
		setTimeout(() => {
			setIsSubmitting(false);
		}, 2000)
	};
	
	return (
		<div
			className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20 p-4">
			<Card className="w-full max-w-4xl overflow-hidden">
				<CardContent className="p-0">
					<div className="flex flex-col md:flex-row min-h-[480px]">
						<div
							className="md:w-1/2 bg-primary p-8 text-primary-foreground flex flex-col justify-center items-center">
							<Image
								src={logoSrc}
								alt="SiPher"
								width={120}
								height={120}
								className="mb-8"
							/>
							<h1 className="text-3xl font-bold mb-4 text-center">
								Silent Whisper
							</h1>
							<p className="text-center mb-8">
								Trust the shadows. Whisper safely.
							</p>
						</div>
						<div className="md:w-1/2 p-8">
							<motion.div
								initial={{opacity: 0, y: 20}}
								animate={{opacity: 1, y: 0}}
								transition={{duration: 0.5}}
							>
								<h2 className="text-2xl font-semibold mb-6 text-center">
									{isLogin ? "Sign In" : "Sign Up"}
								</h2>
								<form className="space-y-4" onSubmit={handleSubmit}>
									<div>
										<Label htmlFor="username">
											Username
										</Label>
										<Input id="username" type="text" placeholder="johndoe"/>
									</div>
									<div>
										<Label htmlFor="password">
											Password
										</Label>
										<div className="relative">
											<Input
												id="password"
												type={showPassword ? "text" : "password"}
												className="pr-10"
												placeholder="********"
											/>
											<button
												type="button"
												className="absolute inset-y-0 right-0 pr-3 flex items-center"
												onClick={() => setShowPassword(!showPassword)}
											>
												{showPassword ? (
													<EyeOffIcon className="h-5 w-5 text-gray-400"/>
												) : (
													<EyeIcon className="h-5 w-5 text-gray-400"/>
												)}
											</button>
										</div>
									</div>
									<Button type="submit" className="w-full" disabled={isSubmitting}>
										{isSubmitting ? "One second, please..." : (isLogin ? "Sign In" : "Sign Up")}
									</Button>
								</form>
								<div className="mt-6 text-center">
									<Button
										variant="link"
										onClick={() => setIsLogin(!isLogin)}
										className="text-sm"
									>
										{isLogin
											? "Don't have an account? Sign Up"
											: "Already have an account? Sign In"
										}
									</Button>
								</div>
							</motion.div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}