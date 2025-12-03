// Get the logo SVG and return it as a React component
import logoDark from "@/assets/logo/logo-dark.svg";
import logoLight from "@/assets/logo/logo-white.svg";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

export default function LogoIcon(
	{
		className,
	}: {
		className?: string;
	}
) {
	const { theme } = useTheme();

	return theme === "dark" ? <img src={logoLight.src} alt="Logo" className={cn("size-6", className)} /> : <img src={logoDark.src} alt="Logo" className={cn("size-6", className)} />;
}