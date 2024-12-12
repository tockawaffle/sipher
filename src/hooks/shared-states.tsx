"use client";

// src/hooks/useSharedState.tsx
import React, {createContext, useContext, useRef, useState} from 'react'

// Define the shape of our shared state
interface SharedState {
	// UI States
	isDrawerOpen: boolean
	setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
	
	// Refs
	drawerRef: React.RefObject<HTMLDivElement | null>
}

// Create the context
const SharedStateContext = createContext<SharedState | undefined>(undefined)

// Create the provider component
export function SharedStateProvider({children}: { children: React.ReactNode }) {
	// UI States
	const [isDrawerOpen, setIsDrawerOpen] = useState(false)
	
	// Refs
	const drawerRef = useRef<HTMLDivElement>(null)
	
	// Theme
	
	const value = {
		// UI States
		isDrawerOpen,
		setIsDrawerOpen,
		// Refs
		drawerRef,
	}
	
	return (
		<SharedStateContext.Provider value={value}>
			{children}
		</SharedStateContext.Provider>
	)
}

// Create the custom hook
export function useSharedState() {
	const context = useContext(SharedStateContext)
	if (context === undefined) {
		throw new Error('useSharedState must be used within a SharedStateProvider')
	}
	return context
}

// Optional: Create specific hooks for different parts of the state
export function useUIState() {
	const {
		
		isDrawerOpen,
		setIsDrawerOpen,
		
	} = useSharedState()
	
	return {
		isDrawerOpen,
		setIsDrawerOpen,
	}
}

export function useRefs() {
	const {
		drawerRef,
	} = useSharedState()
	
	return {
		drawerRef,
	}
}