"use client";

// src/hooks/useSharedState.tsx
import React, {createContext, MutableRefObject, useContext, useRef, useState} from 'react'
import {useTheme} from 'next-themes'

// Define the shape of our shared state
interface SharedState {
	// UI States
	isScrolled: boolean
	setIsScrolled: React.Dispatch<React.SetStateAction<boolean>>
	isSearchExpanded: boolean
	setIsSearchExpanded: React.Dispatch<React.SetStateAction<boolean>>
	isDrawerOpen: boolean
	setIsDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>
	isCreateModalOpen: boolean
	setIsCreateModalOpen: React.Dispatch<React.SetStateAction<boolean>>
	isUserModalOpen: boolean
	setIsUserModalOpen: React.Dispatch<React.SetStateAction<boolean>>
	isNotificationsOpen: boolean
	setIsNotificationsOpen: React.Dispatch<React.SetStateAction<boolean>>
	showBackToTop: boolean
	setShowBackToTop: React.Dispatch<React.SetStateAction<boolean>>
	
	// Refs
	drawerRef: React.RefObject<HTMLDivElement>
	userModalRef: React.RefObject<HTMLDivElement>
	notificationsRef: React.RefObject<HTMLDivElement>
	createModalRef: React.RefObject<HTMLDivElement>
	fileInputRef: React.RefObject<HTMLInputElement>
	observerRef: MutableRefObject<IntersectionObserver | null>
	loadingRef: MutableRefObject<boolean>
	
	// Theme
	theme: string | undefined
}

export function useMutableRef<T>(initialValue: T): MutableRefObject<T> {
	return useRef<T>(initialValue) as MutableRefObject<T>
}

// Create the context
const SharedStateContext = createContext<SharedState | undefined>(undefined)

// Create the provider component
export function SharedStateProvider({children}: { children: React.ReactNode }) {
	// UI States
	const [isScrolled, setIsScrolled] = useState(false)
	const [isSearchExpanded, setIsSearchExpanded] = useState(false)
	const [isDrawerOpen, setIsDrawerOpen] = useState(false)
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
	const [isUserModalOpen, setIsUserModalOpen] = useState(false)
	const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
	const [showBackToTop, setShowBackToTop] = useState(false)
	
	// Refs
	const drawerRef = useRef<HTMLDivElement>(null)
	const userModalRef = useRef<HTMLDivElement>(null)
	const notificationsRef = useRef<HTMLDivElement>(null)
	const createModalRef = useRef<HTMLDivElement>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const loadingRef = useMutableRef<boolean>(false)
	const observerRef = useMutableRef<IntersectionObserver | null>(null)
	
	// Theme
	const {theme} = useTheme()
	
	const value = {
		// UI States
		isScrolled,
		setIsScrolled,
		isSearchExpanded,
		setIsSearchExpanded,
		isDrawerOpen,
		setIsDrawerOpen,
		isCreateModalOpen,
		setIsCreateModalOpen,
		isUserModalOpen,
		setIsUserModalOpen,
		isNotificationsOpen,
		setIsNotificationsOpen,
		showBackToTop,
		setShowBackToTop,
		
		// Refs
		drawerRef,
		userModalRef,
		notificationsRef,
		createModalRef,
		fileInputRef,
		observerRef,
		loadingRef,
		
		// Theme
		theme,
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
		isScrolled,
		setIsScrolled,
		isSearchExpanded,
		setIsSearchExpanded,
		isDrawerOpen,
		setIsDrawerOpen,
		isCreateModalOpen,
		setIsCreateModalOpen,
		isUserModalOpen,
		setIsUserModalOpen,
		isNotificationsOpen,
		setIsNotificationsOpen,
		showBackToTop,
		setShowBackToTop,
	} = useSharedState()
	
	return {
		isScrolled,
		setIsScrolled,
		isSearchExpanded,
		setIsSearchExpanded,
		isDrawerOpen,
		setIsDrawerOpen,
		isCreateModalOpen,
		setIsCreateModalOpen,
		isUserModalOpen,
		setIsUserModalOpen,
		isNotificationsOpen,
		setIsNotificationsOpen,
		showBackToTop,
		setShowBackToTop,
	}
}

export function useRefs() {
	const {
		drawerRef,
		userModalRef,
		notificationsRef,
		createModalRef,
		fileInputRef,
		observerRef,
		loadingRef,
	} = useSharedState()
	
	return {
		drawerRef,
		userModalRef,
		notificationsRef,
		createModalRef,
		fileInputRef,
		observerRef,
		loadingRef,
	}
}