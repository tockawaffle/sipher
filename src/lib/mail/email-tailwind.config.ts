import type { TailwindConfig } from "@react-email/tailwind";
import { pixelBasedPreset } from "@react-email/tailwind";

/**
 * React Email Tailwind config matching globals.css design tokens.
 * Uses literal hex values since email clients don't support CSS variables.
 */
export const emailTailwindConfig: TailwindConfig = {
	presets: [pixelBasedPreset],
	theme: {
		extend: {
			colors: {
				background: "#fafafa",
				foreground: "#0a0a0a",
				card: "#ffffff",
				"card-foreground": "#0a0a0a",
				popover: "#ffffff",
				"popover-foreground": "#0a0a0a",
				primary: "#0a0a0a",
				"primary-foreground": "#fafafa",
				secondary: "#0d9b6b",
				"secondary-foreground": "#fafafa",
				muted: "#f5f5f5",
				"muted-foreground": "#737373",
				accent: "#5ee7c4",
				"accent-foreground": "#032d22",
				destructive: "#e85a5a",
				"destructive-foreground": "#fafafa",
				border: "#e5e5e5",
				input: "#e5e5e5",
				ring: "#0d9b6b",
			},
			fontFamily: {
				sans: ["Inter", "sans-serif"],
				serif: ["Playfair Display", "serif"],
				mono: ["JetBrains Mono", "monospace"],
			},
			borderRadius: {
				sm: "2px",
				md: "3px",
				lg: "5px",
				xl: "9px",
			},
		},
	},
};
