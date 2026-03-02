"use client";

import { Header } from "@/components/layout/header";
import {
	MobileSidebar,
	Sidebar,
	SidebarProvider,
} from "@/components/layout/sidebar";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider>
			<div className="flex h-screen overflow-hidden bg-(--color-bg-subtle) dark:bg-(--color-bg-base)">
				{/* Desktop sidebar — hidden below lg */}
				<Sidebar />

				{/* Mobile sidebar overlay — rendered in a portal-like pattern */}
				<MobileSidebar />

				{/* Main area */}
				<div className="flex flex-1 flex-col min-w-0 overflow-hidden">
					<Header />
					<main className="flex-1 overflow-y-auto">{children}</main>
				</div>
			</div>
		</SidebarProvider>
	);
}
