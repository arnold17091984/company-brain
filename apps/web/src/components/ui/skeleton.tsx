"use client";

// ─── Skeleton UI Components ──────────────────────────────────────────────────
//
// Skeleton        — base shimmer block; uses the .skeleton class from globals.css
// SkeletonText    — multiple lines with progressively decreasing widths
// SkeletonCard    — card placeholder with header, text lines, and badge
// SkeletonTable   — table placeholder with configurable rows and columns

// ─── Types ───────────────────────────────────────────────────────────────────

interface SkeletonProps {
	className?: string;
	height?: string | number;
	width?: string | number;
}

interface SkeletonTextProps {
	lines?: number;
	className?: string;
}

interface SkeletonCardProps {
	className?: string;
}

interface SkeletonTableProps {
	rows?: number;
	cols?: number;
	className?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

/**
 * Returns the width percentage for a given line index.
 * Line 0 → 100%, line 1 → 92%, line 2 → 84%, …  (min 60%)
 */
function lineWidth(index: number): string {
	return `${Math.max(100 - index * 8, 60)}%`;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

/**
 * Base shimmer element. Wraps the global `.skeleton` class which provides the
 * horizontal shimmer animation defined in globals.css.
 */
export function Skeleton({ className, height, width }: SkeletonProps) {
	return (
		<div
			className={cn("skeleton rounded-md", className)}
			style={{
				height: height !== undefined ? height : undefined,
				width: width !== undefined ? width : undefined,
			}}
			aria-hidden="true"
		/>
	);
}

// ─── SkeletonText ────────────────────────────────────────────────────────────

/**
 * Renders `lines` stacked Skeleton divs with decreasing widths to mimic a
 * paragraph of text. Each line is `h-3.5` tall with a `gap-y-2` spacing.
 */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
	return (
		<div className={cn("flex flex-col gap-y-2", className)} aria-hidden="true">
			{Array.from({ length: lines }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: index is stable for static skeleton lines
				<Skeleton key={i} height="0.875rem" width={lineWidth(i)} />
			))}
		</div>
	);
}

// ─── SkeletonCard ────────────────────────────────────────────────────────────

/**
 * Card-shaped placeholder used on templates, recipes, and agent pages.
 * Structure: header bar → 3 text lines → badge row.
 */
export function SkeletonCard({ className }: SkeletonCardProps) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/40 p-5 space-y-4",
				className,
			)}
			aria-hidden="true"
		>
			{/* Card header */}
			<div className="flex items-center gap-3">
				<Skeleton
					height="2.25rem"
					width="2.25rem"
					className="rounded-xl shrink-0"
				/>
				<div className="flex-1 space-y-1.5">
					<Skeleton height="0.875rem" width="55%" />
					<Skeleton height="0.75rem" width="35%" />
				</div>
			</div>

			{/* Text body — 3 lines */}
			<SkeletonText lines={3} />

			{/* Badge row */}
			<div className="flex items-center gap-2 pt-1">
				<Skeleton height="1.25rem" width="3.5rem" className="rounded-full" />
				<Skeleton height="1.25rem" width="3rem" className="rounded-full" />
			</div>
		</div>
	);
}

// ─── SkeletonTable ───────────────────────────────────────────────────────────

/**
 * Table-shaped placeholder. Renders a header row followed by `rows` data rows,
 * each containing `cols` skeleton cells.
 */
export function SkeletonTable({
	rows = 5,
	cols = 4,
	className,
}: SkeletonTableProps) {
	// Guard against division by zero when only one column is present
	const remainingCols = Math.max(cols - 1, 1);
	const restWidth = `${Math.floor(70 / remainingCols)}%`;

	return (
		<div
			className={cn(
				"w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700/60",
				className,
			)}
			aria-hidden="true"
		>
			{/* Table header */}
			<div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700/60 bg-zinc-50 dark:bg-zinc-800/60">
				{Array.from({ length: cols }, (_, i) => {
					// First column is wider; remaining columns share the rest equally
					const width = i === 0 ? "30%" : restWidth;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: index is stable for static skeleton cols
						<Skeleton key={i} height="0.75rem" width={width} />
					);
				})}
			</div>

			{/* Data rows */}
			{Array.from({ length: rows }, (_, rowIndex) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: index is stable for static skeleton rows
					key={rowIndex}
					className={cn(
						"flex items-center gap-4 px-4 py-3.5",
						rowIndex < rows - 1
							? "border-b border-zinc-100 dark:border-zinc-700/40"
							: "",
					)}
				>
					{Array.from({ length: cols }, (_, colIndex) => {
						const width = colIndex === 0 ? "30%" : restWidth;
						// Vary heights slightly so rows feel natural
						const height = colIndex === 0 ? "0.875rem" : "0.75rem";
						return (
							// biome-ignore lint/suspicious/noArrayIndexKey: index is stable for static skeleton cells
							<Skeleton key={colIndex} height={height} width={width} />
						);
					})}
				</div>
			))}
		</div>
	);
}
