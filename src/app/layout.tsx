import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const fontSans = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
});

const fontSerif = Playfair_Display({
	subsets: ["latin"],
	variable: "--font-serif",
});

const fontMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
});

export const metadata: Metadata = {
	title: "Sipher",
	description: "A federated social media platform for the modern age.",
	icons: {
		icon: "/favicon.svg",
	},
	manifest: "/manifest.json",
	themeColor: "#18181b",
	viewport: {
		width: "device-width",
		initialScale: 1,
		maximumScale: 1,
		userScalable: false,
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable} antialiased`}>
				{children}
			</body>
		</html>
	);
}