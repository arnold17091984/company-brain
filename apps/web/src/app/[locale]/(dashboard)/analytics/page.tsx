"use client";

import type { DepartmentData } from "@/components/analytics/department-chart";
import { DepartmentChart } from "@/components/analytics/department-chart";
import { Milestones } from "@/components/analytics/milestones";
import type { OverviewData } from "@/components/analytics/overview-cards";
import { OverviewCards } from "@/components/analytics/overview-cards";
import { UseCases } from "@/components/analytics/use-cases";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Tab = "overview" | "departments" | "usecases" | "milestones";

export default function AnalyticsPage() {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const t = useTranslations("analytics");
	const { data: session } = useSession();

	// ---- Data state --------------------------------------------------------
	const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
	const [overviewLoading, setOverviewLoading] = useState(true);
	const [overviewError, setOverviewError] = useState<string | null>(null);

	const [departmentsData, setDepartmentsData] = useState<
		DepartmentData[] | null
	>(null);
	const [departmentsLoading, setDepartmentsLoading] = useState(true);
	const [departmentsError, setDepartmentsError] = useState<string | null>(null);

	// ---- Auth token --------------------------------------------------------
	const getAccessToken = useCallback(() => {
		return (
			(session as { accessToken?: string } | null)?.accessToken ?? "dev-token"
		);
	}, [session]);

	// ---- Fetch overview ----------------------------------------------------
	useEffect(() => {
		let cancelled = false;

		async function loadOverview() {
			setOverviewLoading(true);
			setOverviewError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/analytics/overview`, {
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
					},
				});

				if (!res.ok) {
					throw new Error(`${res.status} ${res.statusText}`);
				}

				const data: OverviewData = await res.json();
				if (!cancelled) {
					setOverviewData(data);
				}
			} catch {
				if (!cancelled) {
					setOverviewError("Failed to load overview data");
				}
			} finally {
				if (!cancelled) {
					setOverviewLoading(false);
				}
			}
		}

		loadOverview();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken]);

	// ---- Fetch departments -------------------------------------------------
	useEffect(() => {
		let cancelled = false;

		async function loadDepartments() {
			setDepartmentsLoading(true);
			setDepartmentsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/departments`,
					{
						headers: {
							Authorization: `Bearer ${getAccessToken()}`,
						},
					},
				);

				if (!res.ok) {
					throw new Error(`${res.status} ${res.statusText}`);
				}

				const data: DepartmentData[] = await res.json();
				if (!cancelled) {
					setDepartmentsData(data);
				}
			} catch {
				if (!cancelled) {
					setDepartmentsError("Failed to load department data");
				}
			} finally {
				if (!cancelled) {
					setDepartmentsLoading(false);
				}
			}
		}

		loadDepartments();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken]);

	// ---- Tabs --------------------------------------------------------------
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
				<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
					{t("pageTitle")}
				</h1>
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
					{/* Inline API error banners */}
					{(overviewError || departmentsError) &&
						(activeTab === "overview" || activeTab === "departments") && (
							<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
								{overviewError ?? departmentsError}
							</div>
						)}

					{activeTab === "overview" && (
						<>
							<OverviewCards data={overviewData} isLoading={overviewLoading} />
							<DepartmentChart
								data={departmentsData}
								isLoading={departmentsLoading}
							/>
							<UseCases />
						</>
					)}
					{activeTab === "departments" && (
						<DepartmentChart
							data={departmentsData}
							isLoading={departmentsLoading}
						/>
					)}
					{activeTab === "usecases" && <UseCases />}
					{activeTab === "milestones" && <Milestones />}
				</div>
			</div>
		</div>
	);
}
