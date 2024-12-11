// app/layout.tsx
import type {Metadata} from "next";
import "./globals.css";
import {Public_Sans} from 'next/font/google';
import {UserProvider} from "@/contexts/user";
import Sidebar from "@/components/main/sidebar/sidebar";
import {getAuthenticatedUser} from "@/lib/auth";
import {SharedStateProvider} from "@/hooks/shared-states";
import ThemeProvider from "@/components/ui/theme-provider";
import {headers} from "next/headers";
import {Toaster} from "@/components/ui/toaster";

const publicSans = Public_Sans({
	subsets: ['latin'],
	display: 'swap',
	variable: '--font-public-sans'
});

export const metadata: Metadata = {
	title: "SiPher - Where Shadows Live",
	description: "Secrecy? Not here, absolutely.",
	icons: [{rel: "icon", url: "/logos/logo.png"}],
};

export default async function RootLayout(
	{
		children,
	}: {
		children: React.ReactNode & { props?: { childProp?: { segment?: string } } };
	}) {
	const initialUser = await getAuthenticatedUser();
	const isAuthPage = (await headers()).get("x-current-pathname")?.includes("auth");
	
	// Auth layout
	if (isAuthPage) {
		return (
			<html lang="en" suppressHydrationWarning>
			<body className={`${publicSans.variable} font-sans antialiased`}>
			<ThemeProvider>
				<UserProvider initialUser={initialUser}>
					{children}
				</UserProvider>
			</ThemeProvider>
			<Toaster/>
			</body>
			</html>
		);
	}
	
	// Main layout
	return (
		<html lang="en">
		<body className={`${publicSans.variable} font-sans antialiased`}>
		<ThemeProvider>
			<UserProvider initialUser={initialUser}>
				<SharedStateProvider>
					<div className={`max-h-[1080px] p-6 bg-secondary`}>
						<div className="flex bg-background">
							<Sidebar>
								{children}
							</Sidebar>
						</div>
					</div>
				</SharedStateProvider>
			</UserProvider>
			<Toaster/>
		</ThemeProvider>
		</body>
		</html>
	);
}