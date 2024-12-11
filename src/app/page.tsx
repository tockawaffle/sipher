"use client"
import {useTheme} from "next-themes";
import Image from "next/image";
import {Feather, Search} from "lucide-react";
import {useEffect, useState} from "react";

export default function SiPher() {
	const {theme, systemTheme} = useTheme();
	const [isSearchExpanded, setIsSearchExpanded] = useState(false);
	const [mounted, setMounted] = useState(false);
	
	useEffect(() => {
		setMounted(true);
		
		
	}, []);
	
	const getTheme = () => {
		if (!mounted) return "light";
		if (theme === "system") {
			return systemTheme === "dark" ? "dark" : "light";
		}
		return theme === "dark" ? "dark" : "light";
	};
	
	const currentTheme = getTheme();
	
	return (
		<div
			className={`relative flex-1 ${currentTheme === "dark" ? "dark" : ""} w-full max-h-[600px] bg-gradient-to-b from-background to-background/95`}>
			{/* Animated background elements */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div
					className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(120,120,120,0.05),transparent)]"/>
			</div>
			
			<div className="relative flex flex-col justify-center items-center h-screen px-4 select-none space-y-8">
				{/* Logo section with subtle hover effect */}
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
				
				{/* Main text content with improved typography and spacing */}
				<div className="max-w-2xl space-y-6 text-center">
					<p className="text-lg md:text-xl font-medium leading-relaxed text-primary">
						Where shadows dance and secrets nest, Silent Whisper serves as the dark sanctuary for those
						who value discretion above all. Born from ancient corvid traditions, this messenger's haven ensures your
						whispers remain unheard by all but their intended recipients.
					</p>
					
					<p className="text-sm md:text-base font-medium text-muted-foreground leading-relaxed">
						Like the sacred ravens of old, your messages fly through the darkness, their contents sealed by shadows and
						protected by forgotten wards. Each member of our dark fellowship is known only by their chosen name, their
						true identity shrouded in mystery.
					</p>
				</div>
				
				{/* Enhanced search component */}
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
						/>
					</div>
					
					{/* Decorative feather icon */}
					<Feather
						className={`absolute -right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/30 transform rotate-45
              transition-opacity duration-300 ${isSearchExpanded ? "opacity-100" : "opacity-0"}`}
					/>
				</div>
			</div>
		</div>
	);
}