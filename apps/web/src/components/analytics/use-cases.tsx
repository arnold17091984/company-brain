"use client";

import { useTranslations } from "next-intl";

interface UseCase {
	rank: number;
	labelKey: string;
	pct: number;
	color: string;
}

const USE_CASES: UseCase[] = [
	{ rank: 1, labelKey: "useCaseDocDraft", pct: 35, color: "bg-indigo-500" },
	{ rank: 2, labelKey: "useCaseResearch", pct: 25, color: "bg-green-500" },
	{ rank: 3, labelKey: "useCaseTranslation", pct: 20, color: "bg-violet-500" },
	{ rank: 4, labelKey: "useCaseCodeReview", pct: 12, color: "bg-amber-500" },
	{ rank: 5, labelKey: "useCaseFAQ", pct: 8, color: "bg-rose-500" },
];

export function UseCases() {
	const t = useTranslations("analytics");

	return (
		<section>
			<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6">
				<div className="mb-5">
					<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
						{t("useCasesTitle")}
					</h2>
					<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
						{t("useCasesSub")}
					</p>
				</div>

				<div className="space-y-4">
					{USE_CASES.map((uc) => (
						<div key={uc.labelKey} className="flex items-center gap-4">
							<span className="w-5 text-xs font-semibold text-stone-400 dark:text-stone-500 text-right shrink-0">
								{uc.rank}
							</span>
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between mb-1">
									<span className="text-sm font-medium text-stone-700 dark:text-stone-300">
										{t(uc.labelKey as Parameters<typeof t>[0])}
									</span>
									<span className="text-sm font-semibold text-stone-600 dark:text-stone-400 ml-2 shrink-0">
										{uc.pct}%
									</span>
								</div>
								<div className="w-full h-2 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
									<div
										className={`h-2 rounded-full ${uc.color} transition-all duration-500`}
										style={{ width: `${uc.pct}%` }}
									/>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
