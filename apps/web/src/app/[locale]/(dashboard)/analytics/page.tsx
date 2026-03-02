"use client";

import { DepartmentChart } from "@/components/analytics/department-chart";
import { Milestones } from "@/components/analytics/milestones";
import { OverviewCards } from "@/components/analytics/overview-cards";
import { UseCases } from "@/components/analytics/use-cases";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Tab = "overview" | "departments" | "usecases" | "milestones";

export default function AnalyticsPage() {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const t = useTranslations("analytics");

	const TABS: { id: Tab; label: string }[] = [
		{ id: "overview", label: t("tabOverview") },
		{ id: "departments", label: t("tabDepartments") },
		{ id: "usecases", label: t("tabUseCases") },
		{ id: "milestones", label: t("tabMilestones") },
	];

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t("pageTitle")}</h1>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{/* Tabs */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 shrink-0">
				<nav className="flex gap-1 -mb-px" aria-label="Analytics tabs">
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
								activeTab === tab.id
									? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
									: "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-600"
							}`}
						>
							{tab.label}
						</button>
					))}
				</nav>
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-5xl mx-auto space-y-8">
					{activeTab === "overview" && (
						<>
							<OverviewCards />
							<DepartmentChart />
							<UseCases />
						</>
					)}
					{activeTab === "departments" && <DepartmentChart />}
					{activeTab === "usecases" && <UseCases />}
					{activeTab === "milestones" && <Milestones />}
				</div>
			</div>
		</div>
	);
}
