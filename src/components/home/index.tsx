import LogoIcon from "@/components/ui/logo-icon";
import {
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger
} from "@/components/ui/sidebar";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";

const SidebarItems = [
	{
		id: "home",
		// The icon of the home item is the same as the logo
		icon: <LogoIcon />
	}
]

/**
 * The main component for the homepage. This component is used to wrap all the components of any page.
 * It also is the controller for everything on the app, including going to other pages, showing conversations and other.
 * @param children - The children to be rendered in the sidebar inset
 */
export default function AppSidebar({ children }: { children: React.ReactNode }) {
	return (
		<SidebarProvider
			style={{
				"--sidebar-width": "5rem",
				"--sidebar-width-mobile": "8rem",
			} as React.CSSProperties}
			defaultOpen={true}
		>
			<Sidebar variant="inset" collapsible="offcanvas" className="border-r-0">
				<SidebarHeader className="flex items-center justify-center py-2 pt-4 w-full">
					<Button variant="ghost" size="icon-lg" className="border border-border rounded-lg hover:bg-accent transition-colors">
						<LogoIcon className="size-8" />
					</Button>
				</SidebarHeader>
				<Separator className="my-1.5" />
				<SidebarContent className="px-1.5">
					<SidebarMenu>
						{SidebarItems.map((item) => (
							<SidebarMenuItem key={item.id} className="flex items-center justify-center py-2">
								<Button variant="ghost" size="icon-lg" className="hover:bg-accent transition-colors">
									{item.icon}
								</Button>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarContent>
			</Sidebar>
			<div className="flex flex-col flex-1 min-h-screen">
				<header className="flex items-center justify-between md:justify-center gap-2 px-4 py-1.5 md:border-none border-b border-border  backdrop-blur sticky top-0 z-10">
					<div className="flex items-center gap-2 md:hidden">
						<SidebarTrigger className="size-9" />
					</div>
					<h2 className="text-sm font-semibold">Your Header Title</h2>
					<div className="w-9 md:hidden" /> {/* Spacer for centering on mobile */}
				</header>
				<SidebarInset className="mr-0 mb-0 border-none flex-1 rounded-l-lg">
					<div className="w-full h-full bg-background border-border border rounded-l-lg rounded-bl-none overflow-auto">
						{children}
					</div>
				</SidebarInset>
			</div>
		</SidebarProvider>
	)
}