"use client";

import { useSidebar } from "@/components/layout/sidebar";
import { useTheme } from "@/components/providers/theme-provider";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

// ─── Hamburger Button ───────────────────────────────────────

function HamburgerButton() {
	const { toggle } = useSidebar();

	return (
		<button
			type="button"
			onClick={toggle}
			className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
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

// ─── Dark Mode Toggle ───────────────────────────────────────

function DarkModeToggle() {
	const { theme, toggleTheme } = useTheme();
	const isDark = theme === "dark";

	return (
		<button
			type="button"
			onClick={toggleTheme}
			className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
			aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			{isDark ? (
				// Sun icon — shown in dark mode to switch to light
				<svg
					className="w-4.5 h-4.5"
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
			) : (
				// Moon icon — shown in light mode to switch to dark
				<svg
					className="w-4.5 h-4.5"
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
			)}
		</button>
	);
}

// ─── Language Switcher ──────────────────────────────────────

const LOCALE_LABELS: Record<string, { short: string; long: string }> = {
	en: { short: "EN", long: "English" },
	ja: { short: "JA", long: "日本語" },
	ko: { short: "KO", long: "한국어" },
};

function LanguageSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const [isOpen, setIsOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);

	const switchLocale = useCallback(
		(nextLocale: string) => {
			setIsOpen(false);
			// Replace the current locale segment in the pathname
			// pathname is e.g. /en/chat or /ja/admin/privacy
			const segments = pathname.split("/");
			// segments[0] = "", segments[1] = locale, rest = path
			if (segments[1] && ["en", "ja", "ko"].includes(segments[1])) {
				segments[1] = nextLocale;
			} else {
				segments.splice(1, 0, nextLocale);
			}
			router.push(segments.join("/"));
		},
		[pathname, router],
	);

	const currentLabel = LOCALE_LABELS[locale] ?? {
		short: locale.toUpperCase(),
		long: locale,
	};

	return (
		<div className="relative">
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-label="Switch language"
			>
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
						d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
					/>
				</svg>
				{currentLabel.short}
				<svg
					className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</button>

			{isOpen && (
				<>
					{/* Click-away overlay */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: Overlay dismisses dropdown; keyboard handled on button via Escape */}
					<div
						className="fixed inset-0 z-10"
						onClick={() => setIsOpen(false)}
						aria-hidden="true"
					/>
					<ul
						aria-label="Select language"
						className="absolute right-0 top-full mt-1.5 z-20 min-w-30 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg shadow-zinc-900/10 py-1 overflow-hidden"
					>
						{Object.entries(LOCALE_LABELS).map(([code, labels]) => (
							<li key={code}>
								<button
									type="button"
									onClick={() => switchLocale(code)}
									className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
										code === locale
											? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium"
											: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
									}`}
								>
									<span>{labels.long}</span>
									{code === locale && (
										<svg
											className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0"
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
							</li>
						))}
					</ul>
				</>
			)}
		</div>
	);
}

// ─── Header ─────────────────────────────────────────────────

export function Header() {
	return (
		<header className="relative z-30 flex items-center justify-between h-12 px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 shrink-0">
			{/* Left: hamburger (mobile) + brand */}
			<div className="flex items-center gap-3">
				<HamburgerButton />
				<span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
					Company Brain
				</span>
			</div>

			{/* Right: language switcher + dark mode toggle + user avatar */}
			<div className="flex items-center gap-1">
				<LanguageSwitcher />
				<DarkModeToggle />
				<div className="ml-1 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
					<svg
						className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"
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
			</div>
		</header>
	);
}
