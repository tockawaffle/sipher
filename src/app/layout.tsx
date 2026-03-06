import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Bebas_Neue, DM_Sans, Space_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const fontSans = DM_Sans({
	subsets: ["latin"],
	weight: ["300", "400", "500"],
	variable: "--font-sans",
});

const fontMono = Space_Mono({
	subsets: ["latin"],
	weight: ["400", "700"],
	style: ["normal", "italic"],
	variable: "--font-mono",
});

const fontDisplay = Bebas_Neue({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-display",
});

export const metadata: Metadata = {
	title: "Sipher",
	description: "A federated social media platform for the modern age.",
	icons: {
		icon: "/logo/sipher.svg",
	},
	manifest: "/manifest.json"
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html suppressHydrationWarning>
			<body className={`${fontSans.variable} ${fontMono.variable} ${fontDisplay.variable} antialiased`}>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					<Toaster />
					{children}
				</ThemeProvider>
			</body>
		</html>
	);
}