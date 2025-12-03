import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ConvexClientProvider } from "@/lib/providers/Convex";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "SiPher - Don't trust us. We don't trust you.",
	description: "SiPher is a platform made for communication. Secure? Maybe. Reliable? I don't think so. We don't trust you. We don't trust us. We don't trust anyone.",
	icons: {
		icon: [
			{
				url: "/assets/logo/logo-white.svg",
				href: "/assets/logo/logo-white.svg",
				media: "(prefers-color-scheme: dark)",
				type: "image/svg+xml",
				sizes: "32x32",
				rel: "icon"
			},
			{
				url: "/assets/logo/logo-dark.svg",
				href: "/assets/logo/logo-dark.svg",
				media: "(prefers-color-scheme: light)",
				type: "image/svg+xml",
				sizes: "32x32",
				rel: "icon"
			}
		]
	}
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {

	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className="antialiased min-h-screen bg-background"
			>
				<ConvexClientProvider>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						disableTransitionOnChange
					>
						{children}
					</ThemeProvider>
					<Toaster richColors />
				</ConvexClientProvider>
			</body>
		</html>
	);
}
