"use client";

// ─── Badge Component ─────────────────────────────────────────────────────────
//
// A small inline label with semantic color variants.
//
// Variants: default | primary | success | warning | danger | info
// Sizes:    sm | md

import type { ReactNode } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type BadgeVariant =
	| "default"
	| "primary"
	| "success"
	| "warning"
	| "danger"
	| "info";

export type BadgeSize = "sm" | "md";

interface BadgeProps {
	variant?: BadgeVariant;
	size?: BadgeSize;
	children: ReactNode;
	className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ─── Style Maps ──────────────────────────────────────────────────────────────

/**
 * Color classes for each variant.
 * Light mode uses subtle tinted backgrounds with darker text.
 * Dark mode uses very low-opacity tinted backgrounds with softer text.
 */
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
	default: "bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300",
	primary:
		"bg-indigo-50 text-indigo-700 dark:bg-indigo-500/[0.1] dark:text-indigo-400",
	success:
		"bg-emerald-50 text-emerald-700 dark:bg-emerald-500/[0.1] dark:text-emerald-400",
	warning:
		"bg-amber-50 text-amber-700 dark:bg-amber-500/[0.1] dark:text-amber-400",
	danger: "bg-red-50 text-red-700 dark:bg-red-500/[0.1] dark:text-red-400",
	info: "bg-blue-50 text-blue-700 dark:bg-blue-500/[0.1] dark:text-blue-400",
};

/**
 * Padding and text-size classes for each size.
 */
const SIZE_CLASSES: Record<BadgeSize, string> = {
	sm: "text-xs px-1.5 py-0.5",
	md: "text-xs px-2 py-0.5",
};

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Badge — a compact inline label for statuses, categories, and tags.
 *
 * @example
 * <Badge variant="success" size="md">Active</Badge>
 * <Badge variant="danger">Error</Badge>
 */
export function Badge({
	variant = "default",
	size = "md",
	children,
	className,
}: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center font-medium rounded-full leading-none whitespace-nowrap",
				VARIANT_CLASSES[variant],
				SIZE_CLASSES[size],
				className,
			)}
		>
			{children}
		</span>
	);
}
