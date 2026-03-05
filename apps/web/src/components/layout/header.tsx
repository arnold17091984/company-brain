"use client";

import { useSidebar } from "@/components/layout/sidebar";
import { useTheme } from "@/components/providers/theme-provider";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Hamburger Button ───────────────────────────────────────

function HamburgerButton() {
	const { toggle } = useSidebar();

	return (
		<button
			type="button"
			onClick={toggle}
			className="lg:hidden p-2 rounded-xl text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-white/[0.06] transition-all duration-[var(--duration-normal)] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
			aria-label="Toggle sidebar"
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
					d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
				/>
			</svg>
		</button>
	);
}

// ─── Search Trigger (Cmd+K pill) ────────────────────────────

interface SearchTriggerProps {
	onOpen: () => void;
}

function SearchTrigger({ onOpen }: SearchTriggerProps) {
	const tCommon = useTranslations("common");
	const [isMac, setIsMac] = useState(false);

	// Detect platform on client only to avoid SSR mismatch
	useEffect(() => {
		setIsMac(navigator.platform.toUpperCase().includes("MAC"));
	}, []);

	const modKey = isMac ? "⌘" : "Ctrl";

	return (
		<button
			type="button"
			onClick={onOpen}
			className={[
				"hidden sm:flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full",
				"text-sm text-zinc-500 dark:text-zinc-400",
				"bg-zinc-100/80 dark:bg-white/[0.05]",
				"border border-zinc-200/80 dark:border-white/[0.06]",
				"hover:bg-zinc-200/60 dark:hover:bg-white/[0.08]",
				"transition-all duration-[var(--duration-normal)]",
				"active:scale-[0.97]",
				"focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none",
				"min-w-[180px]",
			].join(" ")}
			aria-label="Open command palette"
		>
			<svg
				className="w-3.5 h-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
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
			<span className="flex-1 text-left text-xs">
				{tCommon("searchPlaceholder")}
			</span>
			<kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-300/50 dark:border-white/[0.06] leading-none">
				{modKey}K
			</kbd>
		</button>
	);
}

// ─── User Avatar Dropdown ────────────────────────────────────

type ThemeOption = "light" | "dark" | "system";

const LOCALE_LABELS: Record<string, { short: string; long: string }> = {
	en: { short: "EN", long: "English" },
	ja: { short: "JA", long: "日本語" },
	ko: { short: "KO", long: "한국어" },
};

interface UserMenuProps {
	userName: string;
	userEmail: string;
	userInitial: string;
}

function UserMenu({ userName, userEmail, userInitial }: UserMenuProps) {
	const { theme, setTheme } = useTheme();
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const tTheme = useTranslations("theme");
	const tLanguage = useTranslations("language");
	const tCommon = useTranslations("common");

	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Close on outside pointer down
	useEffect(() => {
		if (!isOpen) return;
		function onPointerDown(e: PointerEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [isOpen]);

	// Close on Escape
	useEffect(() => {
		if (!isOpen) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				setIsOpen(false);
				buttonRef.current?.focus();
			}
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isOpen]);

	const switchLocale = useCallback(
		(nextLocale: string) => {
			setIsOpen(false);
			const segments = pathname.split("/");
			if (segments[1] && ["en", "ja", "ko"].includes(segments[1])) {
				segments[1] = nextLocale;
			} else {
				segments.splice(1, 0, nextLocale);
			}
			router.push(segments.join("/"));
		},
		[pathname, router],
	);

	const handleThemeSelect = useCallback(
		(selected: ThemeOption) => {
			if (selected === "system") {
				const prefersDark = window.matchMedia(
					"(prefers-color-scheme: dark)",
				).matches;
				setTheme(prefersDark ? "dark" : "light");
			} else {
				setTheme(selected);
			}
		},
		[setTheme],
	);

	const themeOptions: {
		key: ThemeOption;
		label: string;
		icon: React.ReactNode;
	}[] = [
		{
			key: "light",
			label: tTheme("light"),
			icon: (
				<svg
					className="w-3.5 h-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
					/>
				</svg>
			),
		},
		{
			key: "dark",
			label: tTheme("dark"),
			icon: (
				<svg
					className="w-3.5 h-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
					/>
				</svg>
			),
		},
		{
			key: "system",
			label: tTheme("system"),
			icon: (
				<svg
					className="w-3.5 h-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3"
					/>
				</svg>
			),
		},
	];

	return (
		<div ref={dropdownRef} className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className={[
					"w-8 h-8 rounded-full flex items-center justify-center shrink-0",
					"bg-indigo-100 dark:bg-gradient-to-br dark:from-indigo-500 dark:to-violet-600",
					"ring-2 ring-white/[0.12] dark:ring-white/[0.12]",
					"hover:ring-indigo-400/40 dark:hover:ring-indigo-400/40",
					"transition-all duration-[var(--duration-normal)]",
					"active:scale-[0.97]",
					"focus-visible:ring-indigo-400 focus-visible:outline-none",
				].join(" ")}
				aria-label="Open user menu"
				aria-haspopup="true"
				aria-expanded={isOpen}
			>
				<span className="text-xs font-semibold text-indigo-600 dark:text-white/90">
					{userInitial}
				</span>
			</button>

			{isOpen && (
				<div
					className={[
						"absolute right-0 top-full mt-2 w-56 rounded-2xl py-2 overflow-hidden",
						"glass",
						"shadow-lg dark:shadow-2xl dark:shadow-black/60",
						"animate-scale-in",
					].join(" ")}
					style={{ zIndex: "var(--z-dropdown)" }}
					role="menu"
					aria-label="User menu"
				>
					{/* User info */}
					<div className="px-3 pb-2 pt-1 border-b border-zinc-200/60 dark:border-white/[0.06] mb-1">
						<p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
							{userName}
						</p>
						<p className="text-[11px] text-zinc-500 dark:text-zinc-500 truncate mt-0.5">
							{userEmail}
						</p>
					</div>

					{/* Theme section */}
					<div className="px-3 py-2">
						<p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.08em] mb-1.5">
							Theme
						</p>
						<div className="flex gap-1">
							{themeOptions.map((opt) => {
								const isActive = theme === opt.key;
								return (
									<button
										key={opt.key}
										type="button"
										onClick={() => handleThemeSelect(opt.key)}
										role="menuitemradio"
										aria-checked={isActive}
										className={[
											"flex-1 flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg text-[10px] font-medium",
											"transition-colors duration-[var(--duration-normal)]",
											isActive
												? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
												: "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.05]",
										].join(" ")}
									>
										{opt.icon}
										<span>{opt.label}</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Language section */}
					<div className="px-3 pb-2 pt-1 border-t border-zinc-200/60 dark:border-white/[0.06]">
						<p className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.08em] mb-1.5">
							Language
						</p>
						<div className="space-y-0.5">
							{Object.entries(LOCALE_LABELS).map(([code, labels]) => {
								const isActive = code === locale;
								return (
									<button
										key={code}
										type="button"
										onClick={() => switchLocale(code)}
										role="menuitemradio"
										aria-checked={isActive}
										className={[
											"w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg text-xs",
											"transition-colors duration-[var(--duration-normal)]",
											isActive
												? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-medium"
												: "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100/80 dark:hover:bg-white/[0.04]",
										].join(" ")}
									>
										<span>
											{tLanguage(code as Parameters<typeof tLanguage>[0])}
										</span>
										{isActive && (
											<svg
												className="w-3 h-3 text-indigo-500 dark:text-indigo-400 shrink-0"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={2.5}
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M4.5 12.75l6 6 9-13.5"
												/>
											</svg>
										)}
									</button>
								);
							})}
						</div>
					</div>

					{/* Sign out */}
					<div className="border-t border-zinc-200/60 dark:border-white/[0.06] pt-1 px-3 pb-1">
						<button
							type="button"
							role="menuitem"
							onClick={() => signOut({ callbackUrl: "/login" })}
							className={[
								"w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs",
								"text-zinc-600 dark:text-zinc-400",
								"hover:text-red-600 dark:hover:text-red-400",
								"hover:bg-red-50 dark:hover:bg-red-500/[0.06]",
								"transition-colors duration-[var(--duration-normal)]",
							].join(" ")}
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
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Header ─────────────────────────────────────────────────

export interface HeaderProps {
	title?: string;
	onOpenCommandPalette?: () => void;
}

export function Header({ title, onOpenCommandPalette }: HeaderProps) {
	const { data: session } = useSession();

	const userName = session?.user?.name ?? "User";
	const userEmail = session?.user?.email ?? "";
	const userInitial = userName.charAt(0).toUpperCase();

	return (
		<header className="relative z-30 flex items-center h-14 px-4 bg-white/80 dark:bg-[#0e0e12]/90 backdrop-blur-xl border-b border-zinc-200/60 dark:border-white/[0.04] shrink-0">
			{/* Left: hamburger (mobile) + title */}
			<div className="flex items-center gap-3 min-w-0 flex-1">
				<HamburgerButton />
				{title ? (
					<h1 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 truncate">
						{title}
					</h1>
				) : (
					<span className="text-sm font-medium text-zinc-400 dark:text-zinc-500 hidden sm:block">
						Company Brain
					</span>
				)}
			</div>

			{/* Center: Search trigger */}
			{onOpenCommandPalette && (
				<div className="absolute left-1/2 -translate-x-1/2 pointer-events-auto">
					<SearchTrigger onOpen={onOpenCommandPalette} />
				</div>
			)}

			{/* Right: user avatar dropdown */}
			<div className="flex items-center flex-1 justify-end">
				<UserMenu
					userName={userName}
					userEmail={userEmail}
					userInitial={userInitial}
				/>
			</div>
		</header>
	);
}
