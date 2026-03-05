"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
	onNavigate: (path: string) => void;
}

interface PageItem {
	label: string;
	path: string;
	icon:
		| "message"
		| "search"
		| "document"
		| "chart"
		| "template"
		| "book"
		| "agent"
		| "settings";
}

// ─── Static data ──────────────────────────────────────────────────────────────

const PAGES: PageItem[] = [
	{ label: "Chat", path: "/chat", icon: "message" },
	{ label: "Search", path: "/search", icon: "search" },
	{ label: "Documents", path: "/documents", icon: "document" },
	{ label: "Analytics", path: "/analytics", icon: "chart" },
	{ label: "Templates", path: "/templates", icon: "template" },
	{ label: "Recipes", path: "/recipes", icon: "book" },
	{ label: "Agent", path: "/agent", icon: "agent" },
	{ label: "Admin", path: "/admin", icon: "settings" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

/** Fuzzy substring match: every character in `query` must appear in order in `target`. */
function fuzzyMatch(target: string, query: string): boolean {
	if (!query) return true;
	const t = target.toLowerCase();
	const q = query.toLowerCase();
	let ti = 0;
	for (let qi = 0; qi < q.length; qi++) {
		const idx = t.indexOf(q[qi], ti);
		if (idx === -1) return false;
		ti = idx + 1;
	}
	return true;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PageIcon({ type }: { type: PageItem["icon"] }) {
	const cls = "w-5 h-5 shrink-0";
	const stroke = {
		fill: "none",
		viewBox: "0 0 24 24",
		stroke: "currentColor",
		strokeWidth: 1.75,
	} as const;

	switch (type) {
		case "message":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
					/>
				</svg>
			);
		case "search":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
					/>
				</svg>
			);
		case "document":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
					/>
				</svg>
			);
		case "chart":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
					/>
				</svg>
			);
		case "template":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
					/>
				</svg>
			);
		case "book":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
					/>
				</svg>
			);
		case "agent":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21M6.75 8.25v7.5a.75.75 0 00.75.75h7.5a.75.75 0 00.75-.75v-7.5a.75.75 0 00-.75-.75H7.5a.75.75 0 00-.75.75z"
					/>
				</svg>
			);
		case "settings":
			return (
				<svg className={cls} aria-hidden="true" {...stroke}>
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
			);
	}
}

function SearchIcon() {
	return (
		<svg
			className="w-5 h-5 text-zinc-400 shrink-0"
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
	);
}

// ─── CommandPalette ────────────────────────────────────────────────────────────

export function CommandPalette({
	isOpen,
	onClose,
	onNavigate,
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Filtered pages derived from query
	const filteredPages = PAGES.filter((page) => fuzzyMatch(page.label, query));

	// Reset state when palette opens
	useEffect(() => {
		if (isOpen) {
			setQuery("");
			setSelectedIndex(0);
			// Defer focus to after the mount/animation frame
			requestAnimationFrame(() => {
				inputRef.current?.focus();
			});
		}
	}, [isOpen]);

	// Clamp selectedIndex when results change
	useEffect(() => {
		setSelectedIndex((prev) =>
			filteredPages.length === 0 ? 0 : Math.min(prev, filteredPages.length - 1),
		);
	}, [filteredPages.length]);

	// Scroll the selected item into view
	useEffect(() => {
		if (!listRef.current) return;
		const item = listRef.current.querySelector<HTMLElement>(
			`[data-index="${selectedIndex}"]`,
		);
		item?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	const handleSelect = useCallback(
		(path: string) => {
			onNavigate(path);
			onClose();
		},
		[onNavigate, onClose],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex((prev) =>
						filteredPages.length === 0 ? 0 : (prev + 1) % filteredPages.length,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex((prev) =>
						filteredPages.length === 0
							? 0
							: (prev - 1 + filteredPages.length) % filteredPages.length,
					);
					break;
				case "Enter":
					e.preventDefault();
					if (filteredPages[selectedIndex]) {
						handleSelect(filteredPages[selectedIndex].path);
					}
					break;
				case "Escape":
					e.preventDefault();
					onClose();
					break;
			}
		},
		[filteredPages, selectedIndex, handleSelect, onClose],
	);

	if (!isOpen) return null;

	return (
		// Overlay
		// biome-ignore lint/a11y/useKeyWithClickEvents: Overlay dismisses palette; keyboard handled via Escape on input
		<div
			className="fixed inset-0 bg-black/50 flex items-start justify-center px-4"
			style={{ zIndex: "var(--z-command-palette)" }}
			onClick={onClose}
			aria-hidden="true"
		>
			{/* Panel */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Click on panel interior must not close */}
			<dialog
				open
				className="relative mt-[20vh] w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in overflow-hidden bg-white/95 dark:bg-[#1a1a1f]/95 border border-zinc-200/50 dark:border-white/[0.08] backdrop-blur-xl m-0 p-0"
				onClick={(e) => e.stopPropagation()}
				aria-modal="true"
				aria-label="Command palette"
			>
				{/* Search input row */}
				<div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200/60 dark:border-white/[0.06]">
					<SearchIcon />
					<input
						ref={inputRef}
						id="command-palette-input"
						type="text"
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setSelectedIndex(0);
						}}
						onKeyDown={handleKeyDown}
						placeholder="Search pages..."
						className="flex-1 bg-transparent text-base text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none"
						aria-label="Search commands"
						aria-autocomplete="list"
						aria-controls="command-palette-menu"
						aria-expanded={isOpen}
						aria-activedescendant={
							filteredPages[selectedIndex]
								? `cmd-item-${filteredPages[selectedIndex].path}`
								: undefined
						}
						role="combobox"
					/>
					<kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-white/[0.08]">
						ESC
					</kbd>
				</div>

				{/* Results */}
				<div
					id="command-palette-menu"
					ref={listRef}
					className="max-h-[300px] overflow-y-auto py-2"
					role="menu"
					aria-label="Navigation options"
				>
					{filteredPages.length === 0 ? (
						<p className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-8">
							No results
						</p>
					) : (
						<>
							{/* Section header */}
							<p
								className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-1.5"
								aria-hidden="true"
							>
								Pages
							</p>

							{filteredPages.map((page, index) => {
								const isSelected = index === selectedIndex;
								return (
									<button
										key={page.path}
										id={`cmd-item-${page.path}`}
										type="button"
										data-index={index}
										role="menuitem"
										aria-current={isSelected ? true : undefined}
										onClick={() => handleSelect(page.path)}
										onMouseEnter={() => setSelectedIndex(index)}
										className={cn(
											"w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors duration-75 text-left",
											isSelected
												? "bg-indigo-50 dark:bg-indigo-500/[0.1] text-indigo-700 dark:text-indigo-300"
												: "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]",
										)}
									>
										<span
											className={cn(
												isSelected
													? "text-indigo-500 dark:text-indigo-400"
													: "text-zinc-400 dark:text-zinc-500",
											)}
										>
											<PageIcon type={page.icon} />
										</span>
										<span className="flex-1 font-medium">{page.label}</span>
										{isSelected && (
											<span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
												Enter
											</span>
										)}
									</button>
								);
							})}
						</>
					)}
				</div>

				{/* Footer hint */}
				<div className="flex items-center gap-4 px-4 py-2.5 border-t border-zinc-200/60 dark:border-white/[0.06]">
					<span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
						<kbd className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono border border-zinc-200 dark:border-white/[0.08]">
							↑↓
						</kbd>{" "}
						navigate
					</span>
					<span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
						<kbd className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-mono border border-zinc-200 dark:border-white/[0.08]">
							↵
						</kbd>{" "}
						select
					</span>
				</div>
			</dialog>
		</div>
	);
}

// ─── useCommandPalette hook ───────────────────────────────────────────────────

/**
 * Convenience hook that wires up Cmd+K / Ctrl+K to toggle the palette.
 * Returns `{ isOpen, open, close, toggle }`.
 */
export function useCommandPalette() {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	useEffect(() => {
		function onKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				toggle();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [toggle]);

	return { isOpen, open, close, toggle };
}
