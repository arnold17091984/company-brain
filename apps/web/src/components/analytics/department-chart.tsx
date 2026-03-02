"use client";

import { useTranslations } from "next-intl";

// ---- Types ----------------------------------------------------------------

export interface DepartmentData {
	department: string;
	query_count: number;
}

// ---- Color palette (cycled by index) --------------------------------------

const PALETTE: Array<{ bar: string; text: string; dot: string }> = [
	{
		bar: "bg-indigo-500",
		text: "text-indigo-700 dark:text-indigo-400",
		dot: "bg-indigo-500",
	},
	{
		bar: "bg-green-500",
		text: "text-green-700 dark:text-green-400",
		dot: "bg-green-500",
	},
	{
		bar: "bg-violet-500",
		text: "text-violet-700 dark:text-violet-400",
		dot: "bg-violet-500",
	},
	{
		bar: "bg-amber-500",
		text: "text-amber-700 dark:text-amber-400",
		dot: "bg-amber-500",
	},
	{
		bar: "bg-rose-500",
		text: "text-rose-700 dark:text-rose-400",
		dot: "bg-rose-500",
	},
	{
		bar: "bg-cyan-500",
		text: "text-cyan-700 dark:text-cyan-400",
		dot: "bg-cyan-500",
	},
];

// ---- Skeleton -------------------------------------------------------------

function SkeletonBar() {
	return (
		<div className="animate-pulse">
			<div className="flex items-center justify-between mb-1.5">
				<div className="h-4 w-28 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
			</div>
			<div className="w-full h-3 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
				<div className="h-3 rounded-full bg-stone-200 dark:bg-stone-600 w-3/4" />
			</div>
		</div>
	);
}

// ---- Component ------------------------------------------------------------

interface DepartmentChartProps {
	data: DepartmentData[] | null;
	isLoading: boolean;
}

export function DepartmentChart({ data, isLoading }: DepartmentChartProps) {
	const t = useTranslations("analytics");

	const maxQueries =
		data && data.length > 0 ? Math.max(...data.map((d) => d.query_count)) : 1;

	return (
		<section>
			<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6">
				<div className="mb-5">
					<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
						{t("deptActivity")}
					</h2>
					<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
						{t("deptSubtitle")}
					</p>
				</div>

				{isLoading || !data ? (
					<div className="space-y-4">
						<SkeletonBar />
						<SkeletonBar />
						<SkeletonBar />
						<SkeletonBar />
					</div>
				) : (
					<>
						<div className="space-y-4">
							{data.map((dept, idx) => {
								const palette = PALETTE[idx % PALETTE.length];
								const pct = Math.round((dept.query_count / maxQueries) * 100);
								return (
									<div key={dept.department}>
										<div className="flex items-center justify-between mb-1.5">
											<span className="text-sm font-medium text-stone-700 dark:text-stone-300">
												{dept.department}
											</span>
											<span className={`text-sm font-semibold ${palette.text}`}>
												{t("queries", { count: dept.query_count })}
											</span>
										</div>
										<div className="w-full h-3 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
											<div
												className={`h-3 rounded-full ${palette.bar} transition-all duration-500`}
												style={{ width: `${pct}%` }}
											/>
										</div>
									</div>
								);
							})}
						</div>

						<div className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-700 flex flex-wrap gap-3">
							{data.map((dept, idx) => {
								const palette = PALETTE[idx % PALETTE.length];
								return (
									<div
										key={dept.department}
										className="flex items-center gap-1.5"
									>
										<span
											className={`w-2.5 h-2.5 rounded-full ${palette.dot} shrink-0`}
										/>
										<span className="text-xs text-stone-500 dark:text-stone-400">
											{dept.department}
										</span>
									</div>
								);
							})}
						</div>
					</>
				)}
			</div>
		</section>
	);
}
