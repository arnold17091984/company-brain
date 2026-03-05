"use client";

import { type ReactNode, useState } from "react";
import { SkeletonTable } from "./skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Column<T> {
	key: string;
	label: string;
	sortable?: boolean;
	align?: "left" | "center" | "right";
	render?: (item: T) => ReactNode;
	/** Tailwind width class, e.g. "w-48" */
	width?: string;
}

export interface DataTableProps<T> {
	columns: Column<T>[];
	data: T[];
	isLoading?: boolean;
	loadingRows?: number;
	emptyState?: ReactNode;
	onRowClick?: (item: T) => void;
	rowKey: (item: T) => string;
	className?: string;
}

type SortDirection = "asc" | "desc";

interface SortState {
	key: string;
	direction: SortDirection;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

const ALIGN_CLASS: Record<NonNullable<Column<unknown>["align"]>, string> = {
	left: "text-left",
	center: "text-center",
	right: "text-right",
};

// ─── Sort indicator ───────────────────────────────────────────────────────────

function SortIndicator({ direction }: { direction: SortDirection | null }) {
	return (
		<span className="ml-1 inline-flex flex-col gap-px" aria-hidden="true">
			<span
				className={cn(
					"block w-0 h-0",
					"border-l-[3px] border-r-[3px] border-b-[4px]",
					"border-l-transparent border-r-transparent",
					direction === "asc"
						? "border-b-indigo-500 dark:border-b-indigo-400"
						: "border-b-zinc-300 dark:border-b-zinc-600",
				)}
			/>
			<span
				className={cn(
					"block w-0 h-0",
					"border-l-[3px] border-r-[3px] border-t-[4px]",
					"border-l-transparent border-r-transparent",
					direction === "desc"
						? "border-t-indigo-500 dark:border-t-indigo-400"
						: "border-t-zinc-300 dark:border-t-zinc-600",
				)}
			/>
		</span>
	);
}

// ─── Default empty state ──────────────────────────────────────────────────────

function DefaultEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 text-center">
			<svg
				className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-3"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={1.5}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
				/>
			</svg>
			<p className="text-sm text-zinc-500 dark:text-zinc-400">No data</p>
		</div>
	);
}

// ─── DataTable ────────────────────────────────────────────────────────────────

/**
 * Generic, sortable data table with loading skeleton and empty state support.
 *
 * @example
 * <DataTable
 *   columns={[{ key: "name", label: "Name", sortable: true }]}
 *   data={rows}
 *   rowKey={(row) => row.id}
 *   onRowClick={(row) => router.push(`/items/${row.id}`)}
 * />
 */
export function DataTable<T>({
	columns,
	data,
	isLoading = false,
	loadingRows = 5,
	emptyState,
	onRowClick,
	rowKey,
	className,
}: DataTableProps<T>) {
	const [sort, setSort] = useState<SortState | null>(null);

	// ── Sort handler ────────────────────────────────────────────────────────────
	function handleSort(col: Column<T>) {
		if (!col.sortable) return;
		setSort((prev) => {
			if (prev?.key === col.key) {
				return {
					key: col.key,
					direction: prev.direction === "asc" ? "desc" : "asc",
				};
			}
			return { key: col.key, direction: "asc" };
		});
	}

	// ── Sorted data ─────────────────────────────────────────────────────────────
	const sortedData = sort
		? [...data].sort((a, b) => {
				const aVal = (a as Record<string, unknown>)[sort.key];
				const bVal = (b as Record<string, unknown>)[sort.key];
				const cmp =
					typeof aVal === "number" && typeof bVal === "number"
						? aVal - bVal
						: String(aVal ?? "").localeCompare(String(bVal ?? ""));
				return sort.direction === "asc" ? cmp : -cmp;
			})
		: data;

	const isClickable = Boolean(onRowClick);

	return (
		<div
			className={cn(
				"rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] overflow-hidden bg-white dark:bg-[#1a1a1f]",
				className,
			)}
		>
			{isLoading ? (
				// Loading skeleton
				<SkeletonTable
					rows={loadingRows}
					cols={columns.length}
					className="rounded-none border-0"
				/>
			) : (
				// Scrollable table wrapper
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-zinc-200 dark:divide-white/[0.04]">
						{/* ── Header ── */}
						<thead className="bg-zinc-50 dark:bg-white/[0.02]">
							<tr>
								{columns.map((col) => {
									const isSorted = sort?.key === col.key;
									const direction = isSorted ? sort.direction : null;
									const align = ALIGN_CLASS[col.align ?? "left"];

									return (
										<th
											key={col.key}
											scope="col"
											className={cn(
												"px-4 py-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider",
												align,
												col.width,
												col.sortable &&
													"cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-100",
											)}
											aria-sort={
												isSorted
													? direction === "asc"
														? "ascending"
														: "descending"
													: col.sortable
														? "none"
														: undefined
											}
											onClick={col.sortable ? () => handleSort(col) : undefined}
											onKeyDown={
												col.sortable
													? (e) => {
															if (e.key === "Enter" || e.key === " ") {
																e.preventDefault();
																handleSort(col);
															}
														}
													: undefined
											}
											tabIndex={col.sortable ? 0 : undefined}
										>
											<span className="inline-flex items-center gap-1">
												{col.label}
												{col.sortable && (
													<SortIndicator direction={direction} />
												)}
											</span>
										</th>
									);
								})}
							</tr>
						</thead>

						{/* ── Body ── */}
						<tbody className="divide-y divide-zinc-100 dark:divide-white/[0.03] bg-white dark:bg-[#1a1a1f]">
							{sortedData.length === 0 ? (
								<tr>
									<td colSpan={columns.length}>
										{emptyState ?? <DefaultEmptyState />}
									</td>
								</tr>
							) : (
								sortedData.map((item) => (
									<tr
										key={rowKey(item)}
										onClick={isClickable ? () => onRowClick?.(item) : undefined}
										onKeyDown={
											isClickable
												? (e) => {
														if (e.key === "Enter" || e.key === " ") {
															e.preventDefault();
															onRowClick?.(item);
														}
													}
												: undefined
										}
										tabIndex={isClickable ? 0 : undefined}
										role={isClickable ? "button" : undefined}
										className={cn(
											"transition-colors duration-100",
											isClickable
												? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/[0.02] focus-visible:outline-none focus-visible:bg-zinc-50 dark:focus-visible:bg-white/[0.02]"
												: "hover:bg-zinc-50/50 dark:hover:bg-white/[0.01]",
										)}
									>
										{columns.map((col) => {
											const align = ALIGN_CLASS[col.align ?? "left"];
											const raw = (item as Record<string, unknown>)[col.key];
											const content = col.render
												? col.render(item)
												: raw !== null && raw !== undefined
													? String(raw)
													: "—";

											return (
												<td
													key={col.key}
													className={cn(
														"px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 whitespace-nowrap",
														align,
														col.width,
													)}
												>
													{content}
												</td>
											);
										})}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
