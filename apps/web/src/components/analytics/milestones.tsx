"use client";

import { useTranslations } from "next-intl";

interface Milestone {
	date: string;
	team: string;
	title: string;
	description: string;
	badgeColor: string;
	dotColor: string;
}

const MILESTONES: Milestone[] = [
	{
		date: "Mar 2026",
		team: "Sales",
		title: "First proposal template registered",
		description:
			"Sales team uploaded their first reusable proposal template into Company Brain, enabling faster client pitches.",
		badgeColor: "bg-green-50 text-green-700 border-green-200",
		dotColor: "bg-green-500",
	},
	{
		date: "Feb 2026",
		team: "Development",
		title: "100 code reviews completed",
		description:
			"The dev team crossed 100 AI-assisted code reviews, reducing PR turnaround time by an estimated 40%.",
		badgeColor: "bg-indigo-50 text-indigo-700 border-indigo-200",
		dotColor: "bg-indigo-500",
	},
	{
		date: "Feb 2026",
		team: "Marketing",
		title: "Content calendar automated",
		description:
			"Marketing automated their monthly content calendar drafting workflow using Company Brain prompts.",
		badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
		dotColor: "bg-amber-500",
	},
	{
		date: "Jan 2026",
		team: "Back Office",
		title: "HR FAQ knowledge base live",
		description:
			"Back Office indexed the full HR FAQ into the knowledge base, reducing repetitive Telegram questions to the HR team.",
		badgeColor: "bg-violet-50 text-violet-700 border-violet-200",
		dotColor: "bg-violet-500",
	},
	{
		date: "Jan 2026",
		team: "All Teams",
		title: "Company Brain launched",
		description:
			"Company Brain went live for the full 40-person team, unifying knowledge from Google Drive, Notion, and Telegram.",
		badgeColor: "bg-zinc-100 text-zinc-700 border-zinc-200",
		dotColor: "bg-zinc-500",
	},
];

export function Milestones() {
	const t = useTranslations("analytics");

	return (
		<section>
			<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
				<div className="mb-6">
					<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
						{t("milestonesTitle")}
					</h2>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
						{t("milestonesSub")}
					</p>
				</div>

				<ol className="relative">
					{MILESTONES.map((m, idx) => (
						<li key={`${m.team}-${m.title}`} className="flex gap-4">
							{/* Timeline line + dot */}
							<div className="flex flex-col items-center shrink-0">
								<div
									className={`w-3 h-3 rounded-full mt-1 shrink-0 ${m.dotColor}`}
								/>
								{idx < MILESTONES.length - 1 && (
									<div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 mt-1 mb-0" />
								)}
							</div>

							{/* Content */}
							<div
								className={`pb-7 ${idx === MILESTONES.length - 1 ? "pb-0" : ""}`}
							>
								<div className="flex flex-wrap items-center gap-2 mb-1">
									<span
										className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${m.badgeColor}`}
									>
										{m.team}
									</span>
									<span className="text-xs text-zinc-400 dark:text-zinc-500">
										{m.date}
									</span>
								</div>
								<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
									{m.title}
								</p>
								<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
									{m.description}
								</p>
							</div>
						</li>
					))}
				</ol>
			</div>
		</section>
	);
}
