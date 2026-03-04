"use client";

import { useTranslations } from "next-intl";

// ---- Types ----------------------------------------------------------------

export interface OverviewData {
	queries_today: number;
	active_users_today: number;
	documents_this_week: number;
	total_users: number;
}

interface StatCardConfig {
	labelKey: string;
	getValue: (data: OverviewData) => string;
	getSubParams?: (data: OverviewData) => Record<string, string | number>;
	subKey: string;
	iconPath: string;
	iconBg: string;
	iconColor: string;
}

// ---- Card definitions (values now derived from real data) -----------------

const CARD_CONFIGS: StatCardConfig[] = [
	{
		labelKey: "queriesTitle",
		getValue: (d) => String(d.queries_today),
		subKey: "queriesChange",
		iconPath:
			"M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
		iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
		iconColor: "text-indigo-600 dark:text-indigo-400",
	},
	{
		labelKey: "activeUsersTitle",
		getValue: (d) => `${d.active_users_today} / ${d.total_users}`,
		subKey: "activeUsersSub",
		getSubParams: (d) => ({
			pct:
				d.total_users > 0
					? Math.round((d.active_users_today / d.total_users) * 100)
					: 0,
		}),
		iconPath:
			"M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
		iconBg: "bg-green-50 dark:bg-green-950/50",
		iconColor: "text-green-600 dark:text-green-400",
	},
	{
		labelKey: "knowledgeTitle",
		getValue: (d) => String(d.documents_this_week),
		subKey: "knowledgeSub",
		iconPath:
			"M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
		iconBg: "bg-violet-50 dark:bg-violet-950/50",
		iconColor: "text-violet-600 dark:text-violet-400",
	},
	{
		labelKey: "timeSavedTitle",
		// Estimated: 1.5 min saved per query, converted to hours (rounded)
		getValue: (d) => `${Math.round((d.queries_today * 1.5) / 60)} hrs`,
		subKey: "timeSavedSub",
		iconPath: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
		iconBg: "bg-amber-50 dark:bg-amber-950/50",
		iconColor: "text-amber-600 dark:text-amber-400",
	},
];

// ---- Skeleton card --------------------------------------------------------

function SkeletonStatCard() {
	return (
		<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5 animate-pulse">
			<div className="flex items-start gap-3">
				<div className="shrink-0 w-9 h-9 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
				<div className="flex-1 min-w-0 space-y-2">
					<div className="h-3 w-28 bg-zinc-200 dark:bg-zinc-700 rounded" />
					<div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-700 rounded" />
					<div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-600 rounded" />
				</div>
			</div>
		</div>
	);
}

// ---- Component ------------------------------------------------------------

interface OverviewCardsProps {
	data: OverviewData | null;
	isLoading: boolean;
}

export function OverviewCards({ data, isLoading }: OverviewCardsProps) {
	const t = useTranslations("analytics");

	return (
		<section>
			<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-4">
				{t("teamOverview")}
			</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
				{isLoading || !data
					? CARD_CONFIGS.map((cfg) => <SkeletonStatCard key={cfg.labelKey} />)
					: CARD_CONFIGS.map((cfg) => {
							const value = cfg.getValue(data);
							const subParams = cfg.getSubParams
								? cfg.getSubParams(data)
								: undefined;
							return (
								<div
									key={cfg.labelKey}
									className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5"
								>
									<div className="flex items-start gap-3">
										<div
											className={`shrink-0 w-9 h-9 rounded-lg ${cfg.iconBg} ${cfg.iconColor} flex items-center justify-center`}
										>
											<svg
												className="w-5 h-5"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={1.75}
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d={cfg.iconPath}
												/>
											</svg>
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight">
												{t(cfg.labelKey as Parameters<typeof t>[0])}
											</p>
											<p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1 leading-none">
												{value}
											</p>
											<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
												{subParams
													? t(cfg.subKey as Parameters<typeof t>[0], subParams)
													: t(cfg.subKey as Parameters<typeof t>[0])}
											</p>
										</div>
									</div>
								</div>
							);
						})}
			</div>
		</section>
	);
}
