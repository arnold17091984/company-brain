"use client";

import { BrainLogo } from "@/components/brand/brain-logo";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { signOut, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

// ─── Relative time helper ────────────────────────────────────

function relativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	const diffMs = now - then;

	if (Number.isNaN(diffMs)) return "";

	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return `${diffSec}s ago`;
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return new Date(dateStr).toLocaleDateString();
}

// ─── Sidebar Context ────────────────────────────────────────

interface SidebarContextValue {
	isOpen: boolean;
	isCollapsed: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
	toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(
	undefined,
);

const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const [isCollapsed, setIsCollapsed] = useState(false);

	// Restore collapsed state from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
			if (stored === "true") setIsCollapsed(true);
		} catch {
			// localStorage unavailable — silently ignore
		}
	}, []);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	const toggleCollapsed = useCallback(() => {
		setIsCollapsed((prev) => {
			const next = !prev;
			try {
				localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
			} catch {
				// localStorage unavailable — silently ignore
			}
			return next;
		});
	}, []);

	return (
		<SidebarContext.Provider
			value={{ isOpen, isCollapsed, open, close, toggle, toggleCollapsed }}
		>
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
				className="w-5 h-5 shrink-0"
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
				className="w-5 h-5 shrink-0"
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
		labelKey: "documents",
		href: "/documents",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
				/>
			</svg>
		),
	},
	{
		labelKey: "analytics",
		href: "/analytics",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
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
		labelKey: "templates",
		href: "/templates",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
				/>
			</svg>
		),
	},
	{
		labelKey: "recipes",
		href: "/recipes",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
				/>
			</svg>
		),
	},
	{
		labelKey: "agent",
		href: "/agent",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 8.25v7.5a.75.75 0 00.75.75h7.5a.75.75 0 00.75-.75v-7.5a.75.75 0 00-.75-.75H7.5a.75.75 0 00-.75.75z"
				/>
			</svg>
		),
	},
	{
		labelKey: "admin",
		href: "/admin",
		icon: (
			<svg
				className="w-5 h-5 shrink-0"
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

function RecentChats({
	onNavigate,
}: {
	onNavigate?: () => void;
}) {
	const { sessions, isLoading } = useChatSessions();
	const tChat = useTranslations("chat");
	const searchParams = useSearchParams();
	const activeSessionId = searchParams.get("session");

	if (isLoading && sessions.length === 0) {
		return (
			<div className="px-3 py-2 space-y-1.5">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-8 w-full bg-white/[0.04] rounded-lg animate-pulse"
					/>
				))}
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="px-4 py-3">
				<p className="text-xs text-[var(--color-fg-subtle)]">
					{tChat("noChats")}
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-0.5">
			{sessions.slice(0, 10).map((s) => {
				const isActive = activeSessionId === s.id;
				const timeLabel = relativeTime(s.updated_at);

				return (
					<div key={s.id} className="group relative flex items-center">
						<Link
							href={`/chat?session=${s.id}`}
							onClick={onNavigate}
							className={[
								"flex-1 flex items-center justify-between gap-2 pl-3 pr-8 py-2 rounded-lg text-xs transition-colors",
								"duration-[var(--duration-normal)]",
								isActive
									? "bg-indigo-500/[0.12] text-indigo-200 border-l-2 border-indigo-500"
									: "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] hover:bg-white/[0.05] border-l-2 border-transparent",
							].join(" ")}
							title={s.title || "Untitled"}
						>
							<span className="truncate">{s.title || "Untitled"}</span>
							{timeLabel && (
								<span className="shrink-0 text-[10px] text-[var(--color-fg-subtle)] opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--duration-normal)]">
									{timeLabel}
								</span>
							)}
						</Link>
						{/* Delete button — revealed on hover */}
						<button
							type="button"
							className="absolute right-1.5 p-1 rounded-md text-[var(--color-fg-subtle)] hover:text-red-400/80 hover:bg-red-500/[0.08] opacity-0 group-hover:opacity-100 transition-all duration-[var(--duration-normal)] focus-visible:opacity-100"
							aria-label={`Delete chat: ${s.title || "Untitled"}`}
							onClick={(e) => {
								// Delete handler — wire to API when available
								e.preventDefault();
								e.stopPropagation();
							}}
						>
							<svg
								className="w-3.5 h-3.5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>
				);
			})}
		</div>
	);
}

// ─── Collapse Toggle Button ──────────────────────────────────

function CollapseToggle({
	isCollapsed,
	onToggle,
}: {
	isCollapsed: boolean;
	onToggle: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className="p-1.5 rounded-lg text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] hover:bg-white/[0.06] transition-colors duration-[var(--duration-normal)] focus-visible:ring-2 focus-visible:ring-indigo-500"
			aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
			title={isCollapsed ? "Expand (⌘B)" : "Collapse (⌘B)"}
		>
			<svg
				className={[
					"w-4 h-4 transition-transform duration-[var(--duration-normal)]",
					isCollapsed ? "rotate-180" : "",
				].join(" ")}
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.75}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M15.75 19.5L8.25 12l7.5-7.5"
				/>
			</svg>
		</button>
	);
}

// ─── Sidebar Inner Content ──────────────────────────────────

function SidebarContent({
	onNavigate,
	isCollapsed,
}: {
	onNavigate?: () => void;
	isCollapsed: boolean;
}) {
	const pathname = usePathname();
	const { data: session } = useSession();
	const { toggleCollapsed } = useSidebar();
	const tNav = useTranslations("nav");
	const tChat = useTranslations("chat");
	const tCommon = useTranslations("common");

	const userName = session?.user?.name ?? "User";
	const userEmail = session?.user?.email ?? "";
	const userInitial = userName.charAt(0).toUpperCase();

	// Strip the locale prefix for active detection
	const normalizedPath = pathname.replace(/^\/(en|ja|ko)/, "") || "/";
	const isOnChatPage =
		normalizedPath === "/chat" || normalizedPath.startsWith("/chat/");

	return (
		<>
			{/* Brand + Collapse Toggle */}
			<div
				className={[
					"flex items-center border-b border-white/[0.05] shrink-0",
					isCollapsed
						? "justify-center px-3 py-5"
						: "justify-between px-4 py-5",
				].join(" ")}
			>
				{isCollapsed ? (
					<button
						type="button"
						onClick={toggleCollapsed}
						className="focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
						aria-label="Expand sidebar"
						title="Expand (⌘B)"
					>
						<BrainLogo size="sm" />
					</button>
				) : (
					<>
						<div className="flex items-center gap-3 min-w-0">
							<BrainLogo size="sm" />
							<span className="text-sm font-semibold text-white/95 tracking-[-0.01em] truncate">
								{tCommon("companyBrain")}
							</span>
						</div>
						<CollapseToggle
							isCollapsed={isCollapsed}
							onToggle={toggleCollapsed}
						/>
					</>
				)}
			</div>

			{/* New Chat Button */}
			<div
				className={["shrink-0 pt-4 pb-2", isCollapsed ? "px-2" : "px-3"].join(
					" ",
				)}
			>
				<Link
					href="/chat"
					onClick={onNavigate}
					className={[
						"flex items-center gap-2.5 rounded-xl font-medium text-sm",
						"bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700",
						"text-white shadow-lg shadow-indigo-900/30",
						"transition-colors duration-[var(--duration-normal)]",
						"focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-bg-sidebar)]",
						isCollapsed
							? "justify-center p-2.5"
							: "justify-start px-4 py-2.5 w-full",
					].join(" ")}
					aria-label={tChat("newChat")}
					title={isCollapsed ? tChat("newChat") : undefined}
				>
					<svg
						className="w-4 h-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 4.5v15m7.5-7.5h-15"
						/>
					</svg>
					{!isCollapsed && (
						<span className="leading-none">{tChat("newChat")}</span>
					)}
				</Link>
			</div>

			{/* Navigation */}
			<nav
				className={[
					"pt-3 pb-2 space-y-0.5 shrink-0",
					isCollapsed ? "px-2" : "px-3",
				].join(" ")}
				aria-label="Main navigation"
			>
				{NAV_ITEMS.map((item) => {
					const isActive =
						normalizedPath === item.href ||
						normalizedPath.startsWith(`${item.href}/`);

					return (
						<Link
							key={item.href}
							href={item.href}
							onClick={onNavigate}
							className={[
								"flex items-center rounded-lg text-sm font-medium",
								"transition-colors duration-[var(--duration-normal)]",
								isCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
								isActive
									? "bg-indigo-500/[0.12] text-indigo-200 border-l-2 border-indigo-500 pl-[10px]"
									: "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] hover:bg-white/[0.06] active:bg-white/[0.04] border-l-2 border-transparent",
							].join(" ")}
							aria-current={isActive ? "page" : undefined}
							title={
								isCollapsed
									? tNav(item.labelKey as Parameters<typeof tNav>[0])
									: undefined
							}
						>
							<span
								className={isActive ? "text-indigo-400" : ""}
								aria-hidden="true"
							>
								{item.icon}
							</span>
							{!isCollapsed && (
								<span>{tNav(item.labelKey as Parameters<typeof tNav>[0])}</span>
							)}
						</Link>
					);
				})}
			</nav>

			{/* Recent Chats — shown when on chat page and not collapsed */}
			{isOnChatPage && !isCollapsed ? (
				<div className="flex-1 overflow-y-auto px-3 pb-3 border-t border-white/[0.06] min-h-0">
					<div className="flex items-center justify-between px-1 pt-3 pb-2">
						<p className="text-[10px] font-semibold text-[var(--color-fg-subtle)] uppercase tracking-[0.08em]">
							{tChat("recentChats")}
						</p>
					</div>
					<RecentChats onNavigate={onNavigate} />
				</div>
			) : (
				<div className="flex-1" />
			)}

			{/* Footer / user area */}
			<div
				className={[
					"border-t border-white/[0.06] py-4 shrink-0",
					isCollapsed ? "px-2" : "px-3",
				].join(" ")}
			>
				{isCollapsed ? (
					/* Collapsed: just the avatar */
					<div className="flex justify-center">
						<div
							className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 ring-1 ring-white/[0.12] cursor-default"
							title={userName}
							aria-label={userName}
						>
							<span className="text-xs font-semibold text-white/90">
								{userInitial}
							</span>
						</div>
					</div>
				) : (
					/* Expanded: full user row + sign-out */
					<>
						<div className="flex items-center gap-3 px-3 py-2 rounded-lg">
							<div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shrink-0 ring-1 ring-white/[0.12]">
								<span className="text-xs font-semibold text-white/90">
									{userInitial}
								</span>
							</div>
							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium text-zinc-200 truncate">
									{userName}
								</p>
								<p className="text-xs text-[var(--color-fg-subtle)] truncate">
									{userEmail}
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={() => signOut({ callbackUrl: "/login" })}
							className="w-full mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs text-[var(--color-fg-subtle)] hover:text-red-400/80 hover:bg-red-500/[0.06] transition-colors duration-[var(--duration-normal)]"
						>
							<svg
								className="w-4 h-4 shrink-0"
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
					</>
				)}
			</div>
		</>
	);
}

// ─── Keyboard Shortcut Hook ─────────────────────────────────

function useCollapseShortcut() {
	const { toggleCollapsed } = useSidebar();

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "b") {
				e.preventDefault();
				toggleCollapsed();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [toggleCollapsed]);
}

// ─── Desktop Sidebar ────────────────────────────────────────

export function Sidebar() {
	const { isCollapsed } = useSidebar();
	useCollapseShortcut();

	return (
		<aside
			className={[
				"hidden lg:flex flex-col shrink-0 bg-sidebar-gradient text-zinc-300",
				"border-r border-white/[0.05] overflow-hidden",
				"transition-[width] ease-[var(--ease-out-expo)] duration-[var(--duration-slow)]",
				isCollapsed ? "w-[64px]" : "w-64",
			].join(" ")}
			aria-label="Sidebar navigation"
		>
			<SidebarContent isCollapsed={isCollapsed} />
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
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Overlay dismisses sidebar; keyboard handled via close button */}
			<div
				className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
				onClick={close}
				aria-hidden="true"
			/>

			{/* Drawer */}
			<aside
				className="fixed inset-y-0 left-0 z-50 flex flex-col w-64 bg-sidebar-gradient text-zinc-300 border-r border-white/[0.05] lg:hidden animate-slide-in-left shadow-2xl shadow-black/60"
				aria-label="Sidebar navigation"
			>
				{/* Close button */}
				<button
					type="button"
					onClick={close}
					className="absolute top-3 right-3 p-1.5 rounded-lg text-[var(--color-fg-subtle)] hover:text-white hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-white transition-colors duration-[var(--duration-normal)]"
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

				<SidebarContent onNavigate={close} isCollapsed={false} />
			</aside>
		</>
	);
}
