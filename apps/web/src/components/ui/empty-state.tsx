"use client";

// ─── EmptyState Component ─────────────────────────────────────────────────────
//
// Centered placeholder shown when a list or view has no data to display.
// Renders an icon, title, optional subtitle, and an optional action button.
// Uses the `.animate-fade-in` class defined in globals.css for entry animation.

import type { ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmptyStateAction {
	label: string;
	onClick: () => void;
}

interface EmptyStateProps {
	/** Icon element rendered at the top. */
	icon: ReactNode;
	/** Primary heading text. */
	title: string;
	/** Secondary descriptive text (optional). */
	subtitle?: string;
	/** Action button shown below the subtitle (optional). */
	action?: EmptyStateAction;
	className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * EmptyState — a centered placeholder for empty lists, search results, or views.
 *
 * @example
 * <EmptyState
 *   icon={<SearchIcon className="w-6 h-6" />}
 *   title="No documents found"
 *   subtitle="Try adjusting your search or filters."
 *   action={{ label: "Clear filters", onClick: handleClear }}
 * />
 */
export function EmptyState({
	icon,
	title,
	subtitle,
	action,
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"animate-fade-in",
				"flex flex-col items-center justify-center text-center",
				"px-6 py-16",
				className,
			)}
		>
			{/* Icon container — subtle tinted circle */}
			<div
				className={cn(
					"flex items-center justify-center",
					"w-14 h-14 rounded-2xl mb-5 shrink-0",
					"bg-zinc-100 dark:bg-white/[0.05]",
					"text-zinc-400 dark:text-zinc-500",
					"ring-1 ring-zinc-200 dark:ring-white/[0.06]",
				)}
				aria-hidden="true"
			>
				{icon}
			</div>

			{/* Title */}
			<h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
				{title}
			</h3>

			{/* Subtitle */}
			{subtitle && (
				<p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
					{subtitle}
				</p>
			)}

			{/* Action button */}
			{action && (
				<button
					type="button"
					onClick={action.onClick}
					className={cn(
						"mt-5",
						"inline-flex items-center gap-2",
						"min-h-[32px] px-4 py-1.5",
						"text-xs font-medium rounded-lg",
						"transition-colors duration-150",
						"text-zinc-700 dark:text-zinc-300",
						"bg-zinc-100 dark:bg-white/[0.04]",
						"border border-zinc-200 dark:border-white/[0.06]",
						"hover:bg-zinc-200 dark:hover:bg-white/[0.08]",
						"hover:text-zinc-900 dark:hover:text-zinc-100",
					)}
				>
					{action.label}
				</button>
			)}
		</div>
	);
}
