"use client"
import {useTheme} from "next-themes";

export default function SiPher() {
	const {theme} = useTheme()
	
	return (
		<div className={`flex-1 ${theme === "dark" ? "dark" : ""}`}>
		abc
		</div>
	)
}
