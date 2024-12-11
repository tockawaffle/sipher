// components/providers/theme-provider.tsx
'use client'

import {ThemeProvider as NextThemesProvider, type ThemeProviderProps} from "next-themes"
import {useEffect, useState} from "react"

export default function ThemeProvider({children, ...props}: ThemeProviderProps) {
	const [mounted, setMounted] = useState(false)
	
	useEffect(() => {
		setMounted(true)
	}, [])
	
	if (!mounted) {
		return <>{children}</>
	}
	
	return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}