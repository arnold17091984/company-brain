"use client";

// ─── Pagination Component ─────────────────────────────────────────────────────
//
// Displays "Page X of Y" text alongside Previous / Next navigation buttons.
// Buttons are disabled at the first and last pages respectively.
// Styling follows the project's existing premium dark button pattern.

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaginationProps {
	/** Current active page (1-indexed). */
	page: number;
	/** Total number of pages. */
	totalPages: number;
	/** Called with the new page number when Previous or Next is pressed. */
	onPageChange: (page: number) => void;
	/** Optional total item count shown as supplementary info. */
	totalItems?: number;
	className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface NavButtonProps {
	onClick: () => void;
	disabled: boolean;
	label: string;
	direction: "prev" | "next";
}

function NavButton({ onClick, disabled, label, direction }: NavButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			className={cn(
				// Base dimensions and typography
				"inline-flex items-center gap-1.5 min-h-[32px] px-3 py-1.5 text-xs font-medium rounded-lg",
				// Transition
				"transition-all duration-150",
				"active:scale-[0.97]",
				"focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none",
				// Normal state
				"text-zinc-700 dark:text-zinc-300",
				"bg-zinc-100 dark:bg-white/[0.04]",
				"border border-zinc-200 dark:border-white/[0.06]",
				// Hover (only when enabled)
				!disabled && "hover:bg-zinc-200 dark:hover:bg-white/[0.08]",
				!disabled && "hover:text-zinc-900 dark:hover:text-zinc-100",
				// Disabled
				disabled && "opacity-40 cursor-not-allowed",
			)}
		>
			{direction === "prev" && (
				<svg
					className="w-3.5 h-3.5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M15.75 19.5L8.25 12l7.5-7.5"
					/>
				</svg>
			)}
			{label}
			{direction === "next" && (
				<svg
					className="w-3.5 h-3.5 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M8.25 4.5l7.5 7.5-7.5 7.5"
					/>
				</svg>
			)}
		</button>
	);
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Pagination — Previous / Next controls with a "Page X of Y" readout.
 *
 * @example
 * <Pagination
 *   page={currentPage}
 *   totalPages={10}
 *   onPageChange={setCurrentPage}
 *   totalItems={98}
 * />
 */
export function Pagination({
	page,
	totalPages,
	onPageChange,
	totalItems,
	className,
}: PaginationProps) {
	const isFirst = page <= 1;
	const isLast = page >= totalPages;

	return (
		<nav
			aria-label="Pagination"
			className={cn(
				"flex items-center justify-between gap-4 select-none",
				className,
			)}
		>
			{/* Item count (optional) */}
			<div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
				{totalItems !== undefined && (
					<span>
						{totalItems.toLocaleString()} item{totalItems !== 1 ? "s" : ""}
					</span>
				)}
				{/* Page indicator */}
				<span className="font-medium text-zinc-700 dark:text-zinc-300">
					Page <span className="tabular-nums">{page}</span> of{" "}
					<span className="tabular-nums">{totalPages}</span>
				</span>
			</div>

			{/* Navigation buttons */}
			<div className="flex items-center gap-2">
				<NavButton
					direction="prev"
					label="Previous"
					disabled={isFirst}
					onClick={() => onPageChange(page - 1)}
				/>
				<NavButton
					direction="next"
					label="Next"
					disabled={isLast}
					onClick={() => onPageChange(page + 1)}
				/>
			</div>
		</nav>
	);
}
