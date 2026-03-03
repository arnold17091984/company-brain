"use client";

import type { CorrelationDataPoint } from "@/components/analytics/correlation-chart";
import { CorrelationChart } from "@/components/analytics/correlation-chart";
import type { DepartmentData } from "@/components/analytics/department-chart";
import { DepartmentChart } from "@/components/analytics/department-chart";
import { KPIInputForm } from "@/components/analytics/kpi-input-form";
import { Milestones } from "@/components/analytics/milestones";
import type { OverviewData } from "@/components/analytics/overview-cards";
import { OverviewCards } from "@/components/analytics/overview-cards";
import type { ROIReport } from "@/components/analytics/roi-report-viewer";
import { ROIReportViewer } from "@/components/analytics/roi-report-viewer";
import type { UsageMetricsRow } from "@/components/analytics/usage-metrics-table";
import { UsageMetricsTable } from "@/components/analytics/usage-metrics-table";
import { UseCases } from "@/components/analytics/use-cases";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Tab =
	| "overview"
	| "departments"
	| "usecases"
	| "milestones"
	| "usage-kpi"
	| "roi-reports"
	| "kpi-input";

function currentYearMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AnalyticsPage() {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const t = useTranslations("analytics");
	const tRoi = useTranslations("roi");
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

	// ---- ROI tab state -----------------------------------------------------
	const [roiPeriod, setRoiPeriod] = useState<string>(currentYearMonth);

	const [correlationData, setCorrelationData] = useState<
		CorrelationDataPoint[]
	>([]);
	const [correlationLoading, setCorrelationLoading] = useState(false);
	const [correlationError, setCorrelationError] = useState<string | null>(null);

	const [usageMetricsData, setUsageMetricsData] = useState<UsageMetricsRow[]>(
		[],
	);
	const [usageMetricsLoading, setUsageMetricsLoading] = useState(false);
	const [usageMetricsError, setUsageMetricsError] = useState<string | null>(
		null,
	);

	const [roiReports, setRoiReports] = useState<ROIReport[]>([]);
	const [roiReportsLoading, setRoiReportsLoading] = useState(false);
	const [roiReportsError, setRoiReportsError] = useState<string | null>(null);
	const [selectedReport, setSelectedReport] = useState<ROIReport | null>(null);

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

	// ---- Fetch correlation + usage metrics (Usage vs KPI tab) -------------
	useEffect(() => {
		if (activeTab !== "usage-kpi") return;

		let cancelled = false;

		async function loadCorrelation() {
			setCorrelationLoading(true);
			setCorrelationError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/correlation?period=${roiPeriod}`,
					{
						headers: { Authorization: `Bearer ${getAccessToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: CorrelationDataPoint[] = await res.json();
				if (!cancelled) setCorrelationData(data);
			} catch {
				if (!cancelled) setCorrelationError("Failed to load correlation data");
			} finally {
				if (!cancelled) setCorrelationLoading(false);
			}
		}

		async function loadUsageMetrics() {
			setUsageMetricsLoading(true);
			setUsageMetricsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/usage-metrics?period=${roiPeriod}`,
					{
						headers: { Authorization: `Bearer ${getAccessToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: UsageMetricsRow[] = await res.json();
				if (!cancelled) setUsageMetricsData(data);
			} catch {
				if (!cancelled)
					setUsageMetricsError("Failed to load usage metrics data");
			} finally {
				if (!cancelled) setUsageMetricsLoading(false);
			}
		}

		loadCorrelation();
		loadUsageMetrics();

		return () => {
			cancelled = true;
		};
	}, [activeTab, roiPeriod, getAccessToken]);

	// ---- Fetch ROI reports -------------------------------------------------
	useEffect(() => {
		if (activeTab !== "roi-reports") return;

		let cancelled = false;

		async function loadRoiReports() {
			setRoiReportsLoading(true);
			setRoiReportsError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/analytics/roi-reports`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: ROIReport[] = await res.json();
				if (!cancelled) {
					setRoiReports(data);
					setSelectedReport(null);
				}
			} catch {
				if (!cancelled) setRoiReportsError("Failed to load ROI reports");
			} finally {
				if (!cancelled) setRoiReportsLoading(false);
			}
		}

		loadRoiReports();

		return () => {
			cancelled = true;
		};
	}, [activeTab, getAccessToken]);

	// ---- Tabs --------------------------------------------------------------
	const TABS: { id: Tab; label: string }[] = [
		{ id: "overview", label: t("tabOverview") },
		{ id: "departments", label: t("tabDepartments") },
		{ id: "usecases", label: t("tabUseCases") },
		{ id: "milestones", label: t("tabMilestones") },
		{ id: "usage-kpi", label: tRoi("tabUsage") },
		{ id: "roi-reports", label: tRoi("tabReports") },
		{ id: "kpi-input", label: tRoi("tabKpiInput") },
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
				<nav className="flex gap-1 -mb-px overflow-x-auto" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }} aria-label="Analytics tabs">
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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

					{/* Usage vs KPI tab */}
					{activeTab === "usage-kpi" && (
						<div className="space-y-6">
							{/* Period picker */}
							<div className="flex items-center gap-3">
								<label
									htmlFor="roi-period-picker"
									className="text-sm font-medium text-stone-700 dark:text-stone-300 shrink-0"
								>
									Period
								</label>
								<input
									id="roi-period-picker"
									type="month"
									value={roiPeriod}
									onChange={(e) => setRoiPeriod(e.target.value)}
									className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-colors"
								/>
							</div>

							{/* Correlation chart section */}
							<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6">
								<h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-0.5">
									{tRoi("correlationTitle")}
								</h2>
								<p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
									{tRoi("correlationSub")}
								</p>
								{correlationError && (
									<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-4">
										{correlationError}
									</div>
								)}
								{correlationLoading ? (
									<div className="flex items-center justify-center h-64">
										<svg
											className="w-6 h-6 animate-spin text-indigo-500"
											fill="none"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
											/>
										</svg>
									</div>
								) : (
									<CorrelationChart data={correlationData} />
								)}
							</div>

							{/* Usage metrics table section */}
							<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6">
								<h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-4">
									{tRoi("usageMetrics")}
								</h2>
								{usageMetricsError && (
									<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400 mb-4">
										{usageMetricsError}
									</div>
								)}
								{usageMetricsLoading ? (
									<div className="flex items-center justify-center py-12">
										<svg
											className="w-6 h-6 animate-spin text-indigo-500"
											fill="none"
											viewBox="0 0 24 24"
											aria-hidden="true"
										>
											<circle
												className="opacity-25"
												cx="12"
												cy="12"
												r="10"
												stroke="currentColor"
												strokeWidth="4"
											/>
											<path
												className="opacity-75"
												fill="currentColor"
												d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
											/>
										</svg>
									</div>
								) : (
									<UsageMetricsTable data={usageMetricsData} />
								)}
							</div>
						</div>
					)}

					{/* ROI Reports tab */}
					{activeTab === "roi-reports" && (
						<div className="space-y-6">
							{roiReportsError && (
								<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
									{roiReportsError}
								</div>
							)}

							{roiReportsLoading ? (
								<div className="flex items-center justify-center py-16">
									<svg
										className="w-6 h-6 animate-spin text-indigo-500"
										fill="none"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
										/>
									</svg>
								</div>
							) : roiReports.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-20 text-center">
									<div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-4">
										<svg
											className="w-6 h-6 text-stone-400 dark:text-stone-500"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={1.5}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
											/>
										</svg>
									</div>
									<p className="text-sm font-medium text-stone-700 dark:text-stone-300">
										{tRoi("noReports")}
									</p>
									<p className="text-xs text-stone-400 dark:text-stone-500 mt-1 max-w-xs">
										{tRoi("noReportsHint")}
									</p>
								</div>
							) : (
								<div className="space-y-6">
									{/* Report list */}
									{!selectedReport && (
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
											{roiReports.map((report) => (
												<button
													key={report.period}
													type="button"
													onClick={() => setSelectedReport(report)}
													className="text-left bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-5 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all group"
												>
													<div className="flex items-start justify-between gap-2 mb-3">
														<div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center shrink-0">
															<svg
																className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400"
																fill="none"
																viewBox="0 0 24 24"
																stroke="currentColor"
																strokeWidth={1.75}
																aria-hidden="true"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
																/>
															</svg>
														</div>
														<svg
															className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-indigo-400 dark:group-hover:text-indigo-500 transition-colors mt-1 shrink-0"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															strokeWidth={2}
															aria-hidden="true"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																d="M8.25 4.5l7.5 7.5-7.5 7.5"
															/>
														</svg>
													</div>
													<p className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-2">
														{report.period}
													</p>
													<div className="space-y-1">
														<p className="text-xs text-stone-500 dark:text-stone-400">
															{report.active_users} active users &middot;{" "}
															{report.total_queries.toLocaleString()} queries
														</p>
														<p className="text-xs text-stone-500 dark:text-stone-400">
															{report.estimated_hours_saved.toFixed(1)} hrs saved
														</p>
													</div>
												</button>
											))}
										</div>
									)}

									{/* Selected report viewer */}
									{selectedReport && (
										<div className="space-y-4">
											<button
												type="button"
												onClick={() => setSelectedReport(null)}
												className="inline-flex items-center gap-1.5 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
											>
												<svg
													className="w-4 h-4"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={2}
													aria-hidden="true"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M15.75 19.5L8.25 12l7.5-7.5"
													/>
												</svg>
												Back to reports
											</button>
											<ROIReportViewer report={selectedReport} />
										</div>
									)}
								</div>
							)}
						</div>
					)}

					{/* KPI Input tab */}
					{activeTab === "kpi-input" && (
						<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6 max-w-lg">
							<h2 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-4">
								{tRoi("tabKpiInput")}
							</h2>
							<KPIInputForm token={getAccessToken()} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
