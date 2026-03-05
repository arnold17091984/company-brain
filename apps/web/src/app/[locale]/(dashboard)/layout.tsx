"use client";

import { Header } from "@/components/layout/header";
import {
	MobileSidebar,
	Sidebar,
	SidebarProvider,
} from "@/components/layout/sidebar";
import {
	CommandPalette,
	useCommandPalette,
} from "@/components/ui/command-palette";
import { ToastProvider } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

// ─── Inner layout — needs router + command palette ──────────

function DashboardInner({ children }: { readonly children: React.ReactNode }) {
	const router = useRouter();
	const { isOpen, open, close } = useCommandPalette();

	function handleNavigate(path: string) {
		router.push(path);
	}

	return (
		<div className="flex h-screen overflow-hidden bg-(--color-bg-subtle) dark:bg-(--color-bg-base)">
			{/* Desktop sidebar — hidden below lg */}
			<Sidebar />

			{/* Mobile sidebar overlay */}
			<MobileSidebar />

			{/* Main area */}
			<div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-premium-dark">
				<Header onOpenCommandPalette={open} />
				<main className="flex-1 overflow-y-auto">{children}</main>
			</div>

			{/* Command palette — mounted at root so it overlays everything */}
			<CommandPalette
				isOpen={isOpen}
				onClose={close}
				onNavigate={handleNavigate}
			/>
		</div>
	);
}

// ─── Dashboard Layout ────────────────────────────────────────

export default function DashboardLayout({
	children,
}: {
	readonly children: React.ReactNode;
}) {
	return (
		<ToastProvider>
			<SidebarProvider>
				<DashboardInner>{children}</DashboardInner>
			</SidebarProvider>
		</ToastProvider>
	);
}
