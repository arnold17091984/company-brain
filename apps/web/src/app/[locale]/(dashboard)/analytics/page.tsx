"use client";

import type { CorrelationDataPoint } from "@/components/analytics/correlation-chart";
import { CorrelationChart } from "@/components/analytics/correlation-chart";
import type { DepartmentData } from "@/components/analytics/department-chart";
import { DepartmentChart } from "@/components/analytics/department-chart";
import { KPIInputForm } from "@/components/analytics/kpi-input-form";
import { Milestones } from "@/components/analytics/milestones";
import type { OverviewData } from "@/components/analytics/overview-cards";
import type { ROIReport } from "@/components/analytics/roi-report-viewer";
import { ROIReportViewer } from "@/components/analytics/roi-report-viewer";
import type { UsageMetricsRow } from "@/components/analytics/usage-metrics-table";
import { UsageMetricsTable } from "@/components/analytics/usage-metrics-table";
import { UseCases } from "@/components/analytics/use-cases";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab =
	| "overview"
	| "departments"
	| "usecases"
	| "milestones"
	| "usage-kpi"
	| "roi-reports"
	| "kpi-input";

// ── Helpers ────────────────────────────────────────────────────────────────────

function currentYearMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ── StatCard with comparison indicator ────────────────────────────────────────

interface StatCardProps {
	label: string;
	value: string;
	sub: string;
	iconPath: string;
	iconBg: string;
	iconColor: string;
	/** Positive = up (green), negative = down (red), undefined = no indicator */
	change?: number;
	/** stagger delay index */
	index?: number;
}

function StatCard({
	label,
	value,
	sub,
	iconPath,
	iconBg,
	iconColor,
	change,
	index = 0,
}: StatCardProps) {
	const hasChange = change !== undefined && !Number.isNaN(change);
	const isUp = hasChange && change > 0;
	const isDown = hasChange && change < 0;

	return (
		<div
			className="card-glow animate-fade-in bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5 bg-gradient-to-br from-white to-zinc-50/60 dark:from-zinc-800/60 dark:to-zinc-900/40"
			style={{ animationDelay: `${index * 60}ms` }}
		>
			<div className="flex items-start gap-3">
				<div
					className={`shrink-0 w-9 h-9 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}
				>
					<svg
						className="w-5 h-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
					</svg>
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-xs text-zinc-500 dark:text-zinc-400 leading-tight">
						{label}
					</p>
					<div className="flex items-center gap-2 mt-1">
						<p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-none">
							{value}
						</p>
						{hasChange && (
							<span
								className={`inline-flex items-center gap-0.5 text-xs font-semibold leading-none ${
									isUp
										? "text-emerald-600 dark:text-emerald-400"
										: isDown
											? "text-red-500 dark:text-red-400"
											: "text-zinc-400 dark:text-zinc-500"
								}`}
								aria-label={`${isUp ? "Up" : isDown ? "Down" : "No change"} ${Math.abs(change)}%`}
							>
								{isUp ? "▲" : isDown ? "▼" : "–"}
								{Math.abs(change)}%
							</span>
						)}
					</div>
					<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">{sub}</p>
				</div>
			</div>
		</div>
	);
}

// ── StatCards loading skeleton ─────────────────────────────────────────────────

function StatCardsSkeleton() {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
			{[0, 1, 2, 3].map((i) => (
				<div
					key={i}
					className="animate-fade-in rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-800/60 p-5"
					style={{ animationDelay: `${i * 60}ms` }}
				>
					<div className="flex items-start gap-3">
						<Skeleton
							className="shrink-0 rounded-lg"
							height="2.25rem"
							width="2.25rem"
						/>
						<div className="flex-1 space-y-2">
							<Skeleton height="0.75rem" width="55%" />
							<Skeleton height="1.75rem" width="40%" />
							<Skeleton height="0.75rem" width="65%" />
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

// ── Chart loading skeleton ─────────────────────────────────────────────────────

function ChartSkeleton({ height = "16rem" }: { height?: string }) {
	return (
		<div className="animate-fade-in rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-800/60 p-5">
			<Skeleton height="0.875rem" width="30%" className="mb-1.5" />
			<Skeleton height="0.75rem" width="50%" className="mb-4" />
			<Skeleton height={height} className="rounded-lg" />
		</div>
	);
}

// ── Overview tab composition ───────────────────────────────────────────────────

const CARD_CONFIGS = [
	{
		labelKey: "queriesTitle",
		subKey: "queriesChange",
		getValue: (d: OverviewData) => String(d.queries_today),
		getSub: (_d: OverviewData, t: (k: string) => string) => t("queriesChange"),
		iconPath:
			"M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
		iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
		iconColor: "text-indigo-600 dark:text-indigo-400",
		change: 12,
	},
	{
		labelKey: "activeUsersTitle",
		subKey: "activeUsersSub",
		getValue: (d: OverviewData) => `${d.active_users_today} / ${d.total_users}`,
		getSub: (
			d: OverviewData,
			t: (k: string, p?: Record<string, unknown>) => string,
		) =>
			t("activeUsersSub", {
				pct:
					d.total_users > 0
						? Math.round((d.active_users_today / d.total_users) * 100)
						: 0,
			}),
		iconPath:
			"M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
		iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
		iconColor: "text-emerald-600 dark:text-emerald-400",
		change: 5,
	},
	{
		labelKey: "knowledgeTitle",
		subKey: "knowledgeSub",
		getValue: (d: OverviewData) => String(d.documents_this_week),
		getSub: (_d: OverviewData, t: (k: string) => string) => t("knowledgeSub"),
		iconPath:
			"M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
		iconBg: "bg-violet-50 dark:bg-violet-950/50",
		iconColor: "text-violet-600 dark:text-violet-400",
		change: -3,
	},
	{
		labelKey: "timeSavedTitle",
		subKey: "timeSavedSub",
		getValue: (d: OverviewData) =>
			`${Math.round((d.queries_today * 1.5) / 60)} hrs`,
		getSub: (_d: OverviewData, t: (k: string) => string) => t("timeSavedSub"),
		iconPath: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
		iconBg: "bg-amber-50 dark:bg-amber-950/50",
		iconColor: "text-amber-600 dark:text-amber-400",
		change: 8,
	},
] as const;

interface OverviewTabProps {
	overviewData: OverviewData | null;
	overviewLoading: boolean;
	departmentsData: DepartmentData[] | null;
	departmentsLoading: boolean;
}

function OverviewTab({
	overviewData,
	overviewLoading,
	departmentsData,
	departmentsLoading,
}: OverviewTabProps) {
	const t = useTranslations("analytics");

	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-4">
					{t("teamOverview")}
				</h2>
				{overviewLoading || !overviewData ? (
					<StatCardsSkeleton />
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
						{CARD_CONFIGS.map((cfg, i) => (
							<StatCard
								key={cfg.labelKey}
								label={t(cfg.labelKey)}
								value={cfg.getValue(overviewData)}
								sub={cfg.getSub(
									overviewData,
									t as (k: string, p?: Record<string, unknown>) => string,
								)}
								iconPath={cfg.iconPath}
								iconBg={cfg.iconBg}
								iconColor={cfg.iconColor}
								change={cfg.change}
								index={i}
							/>
						))}
					</div>
				)}
			</section>
			{departmentsLoading ? (
				<ChartSkeleton />
			) : (
				<DepartmentChart data={departmentsData} isLoading={false} />
			)}
			<UseCases />
		</div>
	);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const t = useTranslations("analytics");
	const tRoi = useTranslations("roi");
	const { data: session } = useSession();

	// ── Data state ────────────────────────────────────────────────────────────

	const [overviewData, setOverviewData] = useState<OverviewData | null>(null);
	const [overviewLoading, setOverviewLoading] = useState(true);
	const [overviewError, setOverviewError] = useState<string | null>(null);

	const [departmentsData, setDepartmentsData] = useState<
		DepartmentData[] | null
	>(null);
	const [departmentsLoading, setDepartmentsLoading] = useState(true);
	const [departmentsError, setDepartmentsError] = useState<string | null>(null);

	// ── ROI tab state ─────────────────────────────────────────────────────────

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

	// ── Auth token ────────────────────────────────────────────────────────────

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	// ── Fetch overview ────────────────────────────────────────────────────────

	useEffect(() => {
		let cancelled = false;

		async function loadOverview() {
			setOverviewLoading(true);
			setOverviewError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/analytics/overview`, {
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: OverviewData = await res.json();
				if (!cancelled) setOverviewData(data);
			} catch {
				if (!cancelled) setOverviewError("Failed to load overview data");
			} finally {
				if (!cancelled) setOverviewLoading(false);
			}
		}

		loadOverview();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	// ── Fetch departments ─────────────────────────────────────────────────────

	useEffect(() => {
		let cancelled = false;

		async function loadDepartments() {
			setDepartmentsLoading(true);
			setDepartmentsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/departments`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: DepartmentData[] = await res.json();
				if (!cancelled) setDepartmentsData(data);
			} catch {
				if (!cancelled) setDepartmentsError("Failed to load department data");
			} finally {
				if (!cancelled) setDepartmentsLoading(false);
			}
		}

		loadDepartments();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	// ── Fetch correlation + usage metrics ─────────────────────────────────────

	useEffect(() => {
		if (activeTab !== "usage-kpi") return;

		let cancelled = false;

		async function loadCorrelation() {
			setCorrelationLoading(true);
			setCorrelationError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/correlation?period=${roiPeriod}`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
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
					{ headers: { Authorization: `Bearer ${getToken()}` } },
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
	}, [activeTab, roiPeriod, getToken]);

	// ── Fetch ROI reports ─────────────────────────────────────────────────────

	useEffect(() => {
		if (activeTab !== "roi-reports") return;

		let cancelled = false;

		async function loadRoiReports() {
			setRoiReportsLoading(true);
			setRoiReportsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/roi-reports`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);
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
	}, [activeTab, getToken]);

	// ── Tabs definition ───────────────────────────────────────────────────────

	const TABS: { id: Tab; label: string }[] = [
		{ id: "overview", label: t("tabOverview") },
		{ id: "departments", label: t("tabDepartments") },
		{ id: "usecases", label: t("tabUseCases") },
		{ id: "milestones", label: t("tabMilestones") },
		{ id: "usage-kpi", label: tRoi("tabUsage") },
		{ id: "roi-reports", label: tRoi("tabReports") },
		{ id: "kpi-input", label: tRoi("tabKpiInput") },
	];

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{/* Tab bar */}
			<div className="px-8 py-3 shrink-0">
				<nav
					className="bg-zinc-100 dark:bg-zinc-800/80 rounded-xl p-1 inline-flex gap-0.5 overflow-x-auto"
					style={
						{
							scrollbarWidth: "none",
							WebkitOverflowScrolling: "touch",
						} as React.CSSProperties
					}
					aria-label="Analytics tabs"
				>
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-4 py-2 text-sm transition-all duration-150 whitespace-nowrap rounded-lg ${
								activeTab === tab.id
									? "bg-white dark:bg-zinc-700/80 shadow-sm text-zinc-950 dark:text-zinc-100 font-medium ring-1 ring-zinc-200/50 dark:ring-white/[0.06]"
									: "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
							}`}
						>
							{tab.label}
						</button>
					))}
				</nav>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
					{/* Error banners for always-loaded data */}
					{overviewError &&
						(activeTab === "overview" || activeTab === "departments") && (
							<ErrorBanner message={overviewError} />
						)}
					{departmentsError && activeTab === "departments" && (
						<ErrorBanner message={departmentsError} />
					)}

					{/* Overview tab */}
					{activeTab === "overview" && (
						<OverviewTab
							overviewData={overviewData}
							overviewLoading={overviewLoading}
							departmentsData={departmentsData}
							departmentsLoading={departmentsLoading}
						/>
					)}

					{/* Departments tab */}
					{activeTab === "departments" &&
						(departmentsLoading ? (
							<ChartSkeleton height="20rem" />
						) : (
							<DepartmentChart data={departmentsData} isLoading={false} />
						))}

					{activeTab === "usecases" && <UseCases />}
					{activeTab === "milestones" && <Milestones />}

					{/* Usage vs KPI tab */}
					{activeTab === "usage-kpi" && (
						<div className="space-y-6">
							{/* Period picker */}
							<div className="flex items-center gap-3">
								<label
									htmlFor="roi-period-picker"
									className="text-sm font-medium text-zinc-700 dark:text-zinc-300 shrink-0"
								>
									Period
								</label>
								<input
									id="roi-period-picker"
									type="month"
									value={roiPeriod}
									onChange={(e) => setRoiPeriod(e.target.value)}
									className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-colors"
								/>
							</div>

							{/* Correlation chart */}
							<div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5">
								<h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-0.5">
									{tRoi("correlationTitle")}
								</h2>
								<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
									{tRoi("correlationSub")}
								</p>
								{correlationError && (
									<ErrorBanner message={correlationError} className="mb-4" />
								)}
								{correlationLoading ? (
									<Skeleton height="16rem" className="rounded-lg" />
								) : (
									<CorrelationChart data={correlationData} />
								)}
							</div>

							{/* Usage metrics table */}
							<div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5">
								<h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-4">
									{tRoi("usageMetrics")}
								</h2>
								{usageMetricsError && (
									<ErrorBanner message={usageMetricsError} className="mb-4" />
								)}
								{usageMetricsLoading ? (
									<Skeleton height="12rem" className="rounded-lg" />
								) : (
									<UsageMetricsTable data={usageMetricsData} />
								)}
							</div>
						</div>
					)}

					{/* ROI Reports tab */}
					{activeTab === "roi-reports" && (
						<div className="space-y-6">
							{roiReportsError && <ErrorBanner message={roiReportsError} />}

							{roiReportsLoading ? (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{[0, 1, 2].map((i) => (
										<div
											key={i}
											className="rounded-xl border border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-800/60 p-5 space-y-3"
										>
											<div className="flex items-start justify-between">
												<Skeleton
													height="2.25rem"
													width="2.25rem"
													className="rounded-lg"
												/>
												<Skeleton
													height="1rem"
													width="1rem"
													className="rounded"
												/>
											</div>
											<Skeleton height="0.875rem" width="50%" />
											<Skeleton height="0.75rem" width="75%" />
											<Skeleton height="0.75rem" width="60%" />
										</div>
									))}
								</div>
							) : roiReports.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-20 text-center">
									<div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
										<svg
											className="w-6 h-6 text-zinc-400 dark:text-zinc-500"
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
									<p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
										{tRoi("noReports")}
									</p>
									<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs">
										{tRoi("noReportsHint")}
									</p>
								</div>
							) : (
								<div className="space-y-6">
									{!selectedReport && (
										<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
											{roiReports.map((report) => (
												<button
													key={report.period}
													type="button"
													onClick={() => setSelectedReport(report)}
													className="card-glow text-left bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5 hover:border-indigo-300 dark:hover:border-indigo-600/50 transition-[border-color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none group"
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
															className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-indigo-400 dark:group-hover:text-indigo-500 transition-colors mt-1 shrink-0"
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
													<p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
														{report.period}
													</p>
													<div className="space-y-1">
														<p className="text-xs text-zinc-500 dark:text-zinc-400">
															{report.active_users} active users &middot;{" "}
															{report.total_queries.toLocaleString()} queries
														</p>
														<p className="text-xs text-zinc-500 dark:text-zinc-400">
															{report.estimated_hours_saved.toFixed(1)} hrs
															saved
														</p>
													</div>
												</button>
											))}
										</div>
									)}

									{selectedReport && (
										<div className="space-y-4">
											<button
												type="button"
												onClick={() => setSelectedReport(null)}
												className="inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
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
						<div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5 max-w-lg">
							<h2 className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-4">
								{tRoi("tabKpiInput")}
							</h2>
							<KPIInputForm token={getToken()} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
