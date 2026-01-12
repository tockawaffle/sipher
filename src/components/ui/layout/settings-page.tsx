"use client"

import * as React from "react"

export interface SettingsPageProps {
	// Add settings-specific props as needed
}

export function SettingsPage({}: SettingsPageProps) {
	return (
		<div className="flex flex-col flex-1 overflow-y-auto p-2 md:p-4">
			<div className="flex items-center min-h-10 max-h-10">
				<span className="text-sm font-medium">Servers</span>
			</div>
		</div>
	)
}

