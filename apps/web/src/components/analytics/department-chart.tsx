"use client";

import { useTranslations } from "next-intl";

interface Department {
	nameKey: string;
	queries: number;
	color: string;
	textColor: string;
}

const DEPARTMENTS: Department[] = [
	{ nameKey: "deptDev", queries: 312, color: "bg-indigo-500", textColor: "text-indigo-700" },
	{ nameKey: "deptSales", queries: 218, color: "bg-green-500", textColor: "text-green-700" },
	{ nameKey: "deptBackOffice", queries: 174, color: "bg-violet-500", textColor: "text-violet-700" },
	{ nameKey: "deptMarketing", queries: 96, color: "bg-amber-500", textColor: "text-amber-700" },
];

const MAX_QUERIES = Math.max(...DEPARTMENTS.map((d) => d.queries));

export function DepartmentChart() {
	const t = useTranslations("analytics");

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

				<div className="space-y-4">
					{DEPARTMENTS.map((dept) => {
						const pct = Math.round((dept.queries / MAX_QUERIES) * 100);
						const name = t(dept.nameKey as Parameters<typeof t>[0]);
						return (
							<div key={dept.nameKey}>
								<div className="flex items-center justify-between mb-1.5">
									<span className="text-sm font-medium text-stone-700 dark:text-stone-300">
										{name}
									</span>
									<span className={`text-sm font-semibold ${dept.textColor}`}>
										{t("queries", { count: dept.queries })}
									</span>
								</div>
								<div className="w-full h-3 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
									<div
										className={`h-3 rounded-full ${dept.color} transition-all duration-500`}
										style={{ width: `${pct}%` }}
									/>
								</div>
							</div>
						);
					})}
				</div>

				<div className="mt-5 pt-4 border-t border-stone-100 dark:border-stone-700 flex flex-wrap gap-3">
					{DEPARTMENTS.map((dept) => (
						<div key={dept.nameKey} className="flex items-center gap-1.5">
							<span
								className={`w-2.5 h-2.5 rounded-full ${dept.color} shrink-0`}
							/>
							<span className="text-xs text-stone-500 dark:text-stone-400">
								{t(dept.nameKey as Parameters<typeof t>[0])}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
