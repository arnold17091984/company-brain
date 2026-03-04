"use client";

import { useState } from "react";

export interface UsageMetricsRow {
	user_name: string;
	user_email: string;
	department_name: string;
	date: string;
	query_count: number;
	total_input_tokens: number;
	total_output_tokens: number;
	avg_latency_ms: number;
	feedback_up: number;
	feedback_down: number;
}

type SortKey = keyof UsageMetricsRow;
type SortDir = "asc" | "desc";

interface Column {
	key: SortKey;
	label: string;
	align: "left" | "right";
	format?: (value: unknown) => string;
}

const COLUMNS: Column[] = [
	{ key: "user_name", label: "User", align: "left" },
	{ key: "department_name", label: "Department", align: "left" },
	{
		key: "date",
		label: "Date",
		align: "left",
		format: (v) => new Date(v as string).toLocaleDateString(),
	},
	{ key: "query_count", label: "Queries", align: "right" },
	{
		key: "total_input_tokens",
		label: "Input Tokens",
		align: "right",
		format: (v) => Number(v).toLocaleString(),
	},
	{
		key: "total_output_tokens",
		label: "Output Tokens",
		align: "right",
		format: (v) => Number(v).toLocaleString(),
	},
	{
		key: "avg_latency_ms",
		label: "Avg Latency",
		align: "right",
		format: (v) => `${Math.round(Number(v))} ms`,
	},
	{ key: "feedback_up", label: "Thumbs Up", align: "right" },
	{ key: "feedback_down", label: "Thumbs Down", align: "right" },
];

function SortIcon({ dir }: { dir: SortDir | null }) {
	if (!dir) {
		return (
			<svg
				className="w-3 h-3 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9"
				/>
			</svg>
		);
	}
	if (dir === "asc") {
		return (
			<svg
				className="w-3 h-3 text-indigo-600 dark:text-indigo-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M4.5 15.75l7.5-7.5 7.5 7.5"
				/>
			</svg>
		);
	}
	return (
		<svg
			className="w-3 h-3 text-indigo-600 dark:text-indigo-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M19.5 8.25l-7.5 7.5-7.5-7.5"
			/>
		</svg>
	);
}

interface UsageMetricsTableProps {
	data: UsageMetricsRow[];
}

export function UsageMetricsTable({ data }: UsageMetricsTableProps) {
	const [sortKey, setSortKey] = useState<SortKey>("query_count");
	const [sortDir, setSortDir] = useState<SortDir>("desc");

	const handleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	};

	const sorted = [...data].sort((a, b) => {
		const av = a[sortKey];
		const bv = b[sortKey];
		let cmp = 0;
		if (typeof av === "string" && typeof bv === "string") {
			cmp = av.localeCompare(bv);
		} else {
			cmp = Number(av) - Number(bv);
		}
		return sortDir === "asc" ? cmp : -cmp;
	});

	if (data.length === 0) {
		return (
			<output className="flex items-center justify-center py-12 text-sm text-zinc-400 dark:text-zinc-500">
				No usage data available
			</output>
		);
	}

	return (
		<div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
			<table className="w-full text-sm min-w-[800px]">
				<thead>
					<tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60">
						{COLUMNS.map((col) => (
							<th
								key={col.key}
								scope="col"
								aria-label={`Sort by ${col.label}`}
								aria-sort={
									sortKey === col.key
										? sortDir === "asc"
											? "ascending"
											: "descending"
										: "none"
								}
								className={`group px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ${col.align === "right" ? "text-right" : "text-left"}`}
								onClick={() => handleSort(col.key)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleSort(col.key);
									}
								}}
							>
								<span
									className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}
								>
									{col.label}
									<SortIcon dir={sortKey === col.key ? sortDir : null} />
								</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y divide-zinc-100 dark:divide-zinc-700 bg-white dark:bg-zinc-800">
					{sorted.map((row, idx) => (
						<tr
							// biome-ignore lint/suspicious/noArrayIndexKey: table rows keyed by index when no unique id
							key={`${row.user_email}-${row.date}-${idx}`}
							className="hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
						>
							{COLUMNS.map((col) => {
								const raw = row[col.key];
								const displayed = col.format ? col.format(raw) : String(raw);

								if (col.key === "user_name") {
									return (
										<td key={col.key} className="px-4 py-3">
											<p className="font-medium text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">
												{displayed}
											</p>
											<p className="text-xs text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]">
												{row.user_email}
											</p>
										</td>
									);
								}

								if (col.key === "feedback_up") {
									return (
										<td key={col.key} className="px-4 py-3 text-right">
											<span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
												<svg
													className="w-3.5 h-3.5"
													fill="currentColor"
													viewBox="0 0 24 24"
													aria-hidden="true"
												>
													<path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
												</svg>
												{displayed}
											</span>
										</td>
									);
								}

								if (col.key === "feedback_down") {
									return (
										<td key={col.key} className="px-4 py-3 text-right">
											<span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400 font-medium">
												<svg
													className="w-3.5 h-3.5 rotate-180"
													fill="currentColor"
													viewBox="0 0 24 24"
													aria-hidden="true"
												>
													<path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
												</svg>
												{displayed}
											</span>
										</td>
									);
								}

								return (
									<td
										key={col.key}
										className={`px-4 py-3 text-zinc-700 dark:text-zinc-300 ${col.align === "right" ? "text-right tabular-nums" : ""}`}
									>
										{displayed}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
