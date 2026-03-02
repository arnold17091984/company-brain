"use client";

import { useChatSessions } from "@/hooks/use-chat-sessions";
import { useTranslations } from "next-intl";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";

// ─── Sidebar Context ────────────────────────────────────────

interface SidebarContextValue {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	return (
		<SidebarContext.Provider value={{ isOpen, open, close, toggle }}>
			{children}
		</SidebarContext.Provider>
	);
}

export function useSidebar(): SidebarContextValue {
	const ctx = useContext(SidebarContext);
	if (!ctx) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return ctx;
}

// ─── Nav Items ──────────────────────────────────────────────

interface NavItem {
	labelKey: string;
	href: string;
	icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
	{
		labelKey: "chat",
		href: "/chat",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
				/>
			</svg>
		),
	},
	{
		labelKey: "search",
		href: "/search",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
		),
	},
	{
		labelKey: "analytics",
		href: "/analytics",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
				/>
			</svg>
		),
	},
	{
		labelKey: "admin",
		href: "/admin",
		icon: (
			<svg
				className="w-5 h-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
				/>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
				/>
			</svg>
		),
	},
];

// ─── Recent Chats ────────────────────────────────────────────

function RecentChats({ onNavigate }: { onNavigate?: () => void }) {
	const { sessions, isLoading } = useChatSessions();
	const tChat = useTranslations("chat");
	const pathname = usePathname();

	if (isLoading && sessions.length === 0) {
		return (
			<div className="px-3 py-2">
				<div className="h-3 w-24 bg-indigo-800/40 rounded animate-pulse" />
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="px-4 py-2">
				<p className="text-xs text-indigo-500">{tChat("noChats")}</p>
			</div>
		);
	}

	// Check if we're on a chat page with a specific session
	const urlParams = typeof window !== "undefined"
		? new URLSearchParams(window.location.search)
		: null;
	const activeSessionId = urlParams?.get("session");

	return (
		<div className="space-y-0.5">
			{sessions.slice(0, 10).map((s) => {
				const isActive = activeSessionId === s.id;
				return (
					<Link
						key={s.id}
						href={`/chat?session=${s.id}`}
						onClick={onNavigate}
						className={`block px-3 py-1.5 rounded-md text-xs truncate transition-colors ${
							isActive
								? "bg-indigo-600/50 text-white"
								: "text-indigo-400 hover:text-indigo-200 hover:bg-indigo-800/30"
						}`}
						title={s.title || "Untitled"}
					>
						{s.title || "Untitled"}
					</Link>
				);
			})}
		</div>
	);
}

// ─── Sidebar Inner Content ──────────────────────────────────

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
	const pathname = usePathname();
	const { data: session } = useSession();
	const tNav = useTranslations("nav");
	const tChat = useTranslations("chat");
	const tCommon = useTranslations("common");

	const userName = session?.user?.name ?? "User";
	const userEmail = session?.user?.email ?? "";

	// Strip the locale prefix for active detection
	// e.g. /en/chat → /chat, /ja/admin → /admin
	const normalizedPath = pathname.replace(/^\/(en|ja|ko)/, "") || "/";
	const isOnChatPage = normalizedPath === "/chat" || normalizedPath.startsWith("/chat/");

	return (
		<>
			{/* Brand */}
			<div className="flex items-center gap-2.5 px-4 py-5 border-b border-indigo-800/40">
				<div className="w-7 h-7 rounded-lg bg-indigo-700 flex items-center justify-center shrink-0">
					<svg
						className="w-4 h-4 text-amber-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
						/>
					</svg>
				</div>
				<span className="text-sm font-semibold text-white">{tCommon("companyBrain")}</span>
			</div>

			{/* Navigation */}
			<nav className="px-3 py-4 space-y-1" aria-label="Main navigation">
				{NAV_ITEMS.map((item) => {
					const isActive =
						normalizedPath === item.href ||
						normalizedPath.startsWith(`${item.href}/`);

					return (
						<Link
							key={item.href}
							href={item.href}
							onClick={onNavigate}
							className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
								isActive
									? "bg-indigo-600 text-white shadow-sm shadow-indigo-900/30"
									: "text-indigo-300 hover:text-white hover:bg-indigo-800/40"
							}`}
							aria-current={isActive ? "page" : undefined}
						>
							{item.icon}
							{tNav(item.labelKey as Parameters<typeof tNav>[0])}
						</Link>
					);
				})}
			</nav>

			{/* Recent Chats */}
			{isOnChatPage && (
				<div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-indigo-800/40">
					<div className="flex items-center justify-between px-1 pt-3 pb-2">
						<p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">
							{tChat("recentChats")}
						</p>
						<Link
							href="/chat"
							onClick={onNavigate}
							className="text-xs text-indigo-400 hover:text-indigo-200 transition-colors"
							title={tChat("newChat")}
						>
							<svg
								className="w-4 h-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.75}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 4.5v15m7.5-7.5h-15"
								/>
							</svg>
						</Link>
					</div>
					<RecentChats onNavigate={onNavigate} />
				</div>
			)}

			{/* Spacer when not on chat page */}
			{!isOnChatPage && <div className="flex-1" />}

			{/* Footer / user area */}
			<div className="border-t border-indigo-800/40 px-3 py-4">
				<div className="flex items-center gap-3 px-3 py-2 rounded-lg">
					<div className="w-7 h-7 rounded-full bg-indigo-800 flex items-center justify-center shrink-0">
						<svg
							className="w-4 h-4 text-indigo-300"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.75}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
							/>
						</svg>
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-medium text-indigo-200 truncate">
							{userName}
						</p>
						<p className="text-xs text-indigo-400 truncate">{userEmail}</p>
					</div>
				</div>
				<button
					type="button"
					onClick={() => signOut({ callbackUrl: "/login" })}
					className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-indigo-400 hover:text-indigo-200 hover:bg-indigo-800/40 transition-colors"
				>
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
						/>
					</svg>
					{tCommon("signOut")}
				</button>
			</div>
		</>
	);
}

// ─── Desktop Sidebar ────────────────────────────────────────

export function Sidebar() {
	return (
		<aside className="hidden lg:flex flex-col w-60 shrink-0 bg-sidebar-gradient text-indigo-100">
			<SidebarContent />
		</aside>
	);
}

// ─── Mobile Sidebar Overlay ─────────────────────────────────

export function MobileSidebar() {
	const { isOpen, close } = useSidebar();

	if (!isOpen) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 z-40 bg-black/50 lg:hidden"
				onClick={close}
				aria-hidden="true"
			/>

			{/* Drawer */}
			<aside className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar-gradient text-indigo-100 lg:hidden animate-slide-in-left">
				{/* Close button */}
				<button
					type="button"
					onClick={close}
					className="absolute top-3 right-3 p-1.5 rounded-lg text-indigo-400 hover:text-white hover:bg-indigo-800/40 transition-colors"
					aria-label="Close sidebar"
				>
					<svg
						className="w-5 h-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>

				<SidebarContent onNavigate={close} />
			</aside>
		</>
	);
}
