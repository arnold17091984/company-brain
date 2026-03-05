"use client";

import { Badge } from "@/components/ui/badge";
import type { Column } from "@/components/ui/data-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonCard } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Cluster {
	label: string;
	count: number;
	sample_queries: string[];
}

interface Recommendation {
	topic: string;
	query_count: number;
	priority: "high" | "medium" | "low";
}

interface IngestionStatus {
	connector: string;
	status: "active" | "inactive";
	document_count: number;
	last_synced: string | null;
	error: string | null;
}

interface LogEntry {
	id: string;
	user_email: string;
	action: string;
	query: string | null;
	created_at: string;
	metadata: Record<string, unknown>;
}

interface LogsResponse {
	logs: LogEntry[];
	total: number;
	page: number;
	page_size: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function priorityOrder(p: Recommendation["priority"]): number {
	if (p === "high") return 0;
	if (p === "medium") return 1;
	return 2;
}

/**
 * Returns a human-friendly relative time string for an ISO timestamp.
 * Falls back to a short absolute date/time if the difference is large.
 */
function formatRelativeTime(iso: string): string {
	const now = Date.now();
	const then = new Date(iso).getTime();
	const diffMs = now - then;
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? "s" : ""} ago`;
	if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? "s" : ""} ago`;
	if (diffDay === 1) return "yesterday";
	if (diffDay < 7) return `${diffDay} days ago`;

	return new Date(iso).toLocaleString(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle: string;
}) {
	return (
		<div className="mb-4">
			<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
				{title}
			</h2>
			<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
				{subtitle}
			</p>
		</div>
	);
}

// ── Cluster Card ───────────────────────────────────────────────────────────────

interface ClusterCardProps {
	cluster: Cluster;
	isActive: boolean;
	onClick: () => void;
}

function ClusterCard({ cluster, isActive, onClick }: ClusterCardProps) {
	const t = useTranslations("agent");

	return (
		<button
			type="button"
			onClick={onClick}
			className={`card-glow w-full text-left rounded-xl border p-5 transition-all duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
				isActive
					? "border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/20 ring-1 ring-indigo-300 dark:ring-indigo-600/30"
					: "border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-zinc-800/60 hover:border-indigo-200 dark:hover:border-indigo-600/30"
			}`}
			aria-pressed={isActive}
		>
			<div className="flex items-start justify-between gap-3 mb-3">
				<h3
					className={`font-medium text-sm leading-snug ${
						isActive
							? "text-indigo-700 dark:text-indigo-300"
							: "text-zinc-900 dark:text-zinc-100"
					}`}
				>
					{cluster.label}
				</h3>
				<Badge variant="primary" size="sm">
					{t("queries", { count: cluster.count })}
				</Badge>
			</div>
			{cluster.sample_queries.length > 0 && (
				<div>
					<p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-1.5">
						{t("sampleQueries")}
					</p>
					<ul className="space-y-1">
						{cluster.sample_queries.slice(0, 3).map((q) => (
							<li
								key={q}
								className="text-xs text-zinc-600 dark:text-zinc-400 truncate"
								title={q}
							>
								&ldquo;{q}&rdquo;
							</li>
						))}
					</ul>
				</div>
			)}
		</button>
	);
}

// ── Ingestion Card ─────────────────────────────────────────────────────────────

function IngestionCard({ item }: { item: IngestionStatus }) {
	const t = useTranslations("agent");

	const isActive = item.status === "active";

	const lastSyncedText = item.last_synced
		? t("lastSynced", {
				time: formatRelativeTime(item.last_synced),
			})
		: t("neverSynced");

	const connectorLabel =
		item.connector === "google_drive"
			? "Google Drive"
			: item.connector.charAt(0).toUpperCase() +
				item.connector.slice(1).replace(/_/g, " ");

	return (
		<div className="card-glow bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-white/[0.06] p-5">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
					<ConnectorIcon connector={item.connector} />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
							{connectorLabel}
						</h3>
						<Badge variant={isActive ? "success" : "default"} size="sm">
							<span
								className={`mr-1 inline-block w-1.5 h-1.5 rounded-full ${
									isActive ? "bg-emerald-500" : "bg-zinc-400"
								}`}
								aria-hidden="true"
							/>
							{isActive ? "Active" : "Inactive"}
						</Badge>
					</div>
					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{t("documents", { count: item.document_count })}
					</p>
					<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
						{lastSyncedText}
					</p>
					{item.error && (
						<p className="text-xs text-red-600 dark:text-red-400 mt-1.5 truncate">
							{item.error}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

// ── Connector Icon ─────────────────────────────────────────────────────────────

function ConnectorIcon({ connector }: { connector: string }) {
	switch (connector) {
		case "google_drive":
			return (
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
						d="M3 7l9-4 9 4M3 7l9 4 9-4M3 7v10l9 4 9-4V7"
					/>
				</svg>
			);
		case "notion":
			return (
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
						d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
					/>
				</svg>
			);
		case "telegram":
			return (
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
						d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
					/>
				</svg>
			);
		default:
			return (
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
						d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
					/>
				</svg>
			);
	}
}

// ── Logs empty state icon ──────────────────────────────────────────────────────

function LogsEmptyIcon() {
	return (
		<svg
			className="w-6 h-6"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.5}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
			/>
		</svg>
	);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AgentPage() {
	const t = useTranslations("agent");
	const { data: session } = useSession();

	// ── Clusters state
	const [clusters, setClusters] = useState<Cluster[]>([]);
	const [clustersLoading, setClustersLoading] = useState(true);
	const [clustersError, setClustersError] = useState<string | null>(null);
	const [activeCluster, setActiveCluster] = useState<string | null>(null);

	// ── Recommendations state
	const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
	const [recsLoading, setRecsLoading] = useState(true);
	const [recsError, setRecsError] = useState<string | null>(null);

	// ── Ingestion status state
	const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus[]>([]);
	const [ingestionLoading, setIngestionLoading] = useState(true);
	const [ingestionError, setIngestionError] = useState<string | null>(null);

	// ── Logs state
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [logsLoading, setLogsLoading] = useState(true);
	const [logsError, setLogsError] = useState<string | null>(null);
	const [logsPage, setLogsPage] = useState(1);
	const [logsTotal, setLogsTotal] = useState(0);
	const PAGE_SIZE = 50;

	// ── Auth token
	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	// ── Fetch clusters
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setClustersLoading(true);
			setClustersError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/analytics/clusters`, {
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: Cluster[] = await res.json();
				if (!cancelled) setClusters(data);
			} catch {
				if (!cancelled) setClustersError("Failed to load question clusters");
			} finally {
				if (!cancelled) setClustersLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	// ── Fetch recommendations
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setRecsLoading(true);
			setRecsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/recommendations`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: Recommendation[] = await res.json();
				if (!cancelled) {
					const sorted = [...data].sort(
						(a, b) =>
							priorityOrder(a.priority) - priorityOrder(b.priority) ||
							b.query_count - a.query_count,
					);
					setRecommendations(sorted);
				}
			} catch {
				if (!cancelled) setRecsError("Failed to load recommendations");
			} finally {
				if (!cancelled) setRecsLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	// ── Fetch ingestion status
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIngestionLoading(true);
			setIngestionError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/ingestion-status`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: IngestionStatus[] = await res.json();
				if (!cancelled) setIngestionStatus(data);
			} catch {
				if (!cancelled) setIngestionError("Failed to load ingestion status");
			} finally {
				if (!cancelled) setIngestionLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	// ── Fetch logs
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLogsLoading(true);
			setLogsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/logs?page=${logsPage}&page_size=${PAGE_SIZE}`,
					{ headers: { Authorization: `Bearer ${getToken()}` } },
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: LogsResponse = await res.json();
				if (!cancelled) {
					setLogs(data.logs);
					setLogsTotal(data.total);
				}
			} catch {
				if (!cancelled) setLogsError("Failed to load agent logs");
			} finally {
				if (!cancelled) setLogsLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [getToken, logsPage]);

	// ── Derived state
	const totalPages = Math.max(1, Math.ceil(logsTotal / PAGE_SIZE));

	const filteredLogs = activeCluster
		? logs.filter(
				(entry) =>
					entry.query?.toLowerCase().includes(activeCluster.toLowerCase()) ??
					false,
			)
		: logs;

	// ── Cluster card toggle handler
	function handleClusterClick(label: string) {
		setActiveCluster((prev) => (prev === label ? null : label));
	}

	// ── DataTable column definitions
	const logColumns: Column<LogEntry>[] = [
		{
			key: "created_at",
			label: t("logTime"),
			sortable: true,
			width: "w-36",
			render: (entry) => (
				<span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
					{formatRelativeTime(entry.created_at)}
				</span>
			),
		},
		{
			key: "user_email",
			label: t("logUser"),
			sortable: true,
			width: "w-44",
			render: (entry) => (
				<span className="text-zinc-700 dark:text-zinc-300 truncate block max-w-[11rem]">
					{entry.user_email}
				</span>
			),
		},
		{
			key: "action",
			label: t("logAction"),
			sortable: true,
			width: "w-32",
			render: (entry) => (
				<span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-white/[0.06] dark:text-zinc-300 whitespace-nowrap">
					{entry.action}
				</span>
			),
		},
		{
			key: "query",
			label: t("logQuery"),
			render: (entry) =>
				entry.query ? (
					<span className="text-zinc-600 dark:text-zinc-400 truncate block max-w-[20rem]">
						{entry.query}
					</span>
				) : (
					<span className="text-zinc-400 dark:text-zinc-600 italic text-xs">
						—
					</span>
				),
		},
	];

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-5">
				<div className="max-w-5xl mx-auto space-y-10 animate-fade-in">
					{/* ── Section 1: Question Clusters ─────────────────────── */}
					<section>
						<SectionHeader
							title={t("clustersTitle")}
							subtitle={t("clustersSub")}
						/>

						{clustersError && <ErrorBanner message={clustersError} />}

						{!clustersError && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{clustersLoading ? (
									<>
										<SkeletonCard />
										<SkeletonCard />
										<SkeletonCard />
										<SkeletonCard />
										<SkeletonCard />
										<SkeletonCard />
									</>
								) : clusters.length === 0 ? (
									<div className="col-span-full">
										<EmptyState
											icon={
												<svg
													className="w-6 h-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={1.5}
													aria-hidden="true"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
													/>
												</svg>
											}
											title={t("noData")}
										/>
									</div>
								) : (
									clusters.map((cluster, _clusterIdx) => (
										<div
											key={cluster.label}
											className="animate-fade-in opacity-0"
											style={
												{
													animationDelay: `${_clusterIdx * 60}ms`,
													animationFillMode: "forwards",
												} as React.CSSProperties
											}
										>
											<ClusterCard
												cluster={cluster}
												isActive={activeCluster === cluster.label}
												onClick={() => handleClusterClick(cluster.label)}
											/>
										</div>
									))
								)}
							</div>
						)}

						{/* Active cluster filter indicator */}
						{activeCluster && (
							<div className="mt-3 flex items-center gap-2">
								<span className="text-xs text-zinc-500 dark:text-zinc-400">
									Filtering logs by:
								</span>
								<Badge variant="primary" size="sm">
									{activeCluster}
								</Badge>
								<button
									type="button"
									onClick={() => setActiveCluster(null)}
									aria-label="Clear cluster filter"
									className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-1 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none rounded"
								>
									Clear
								</button>
							</div>
						)}
					</section>

					{/* ── Section 2: Document Recommendations ──────────────── */}
					<section>
						<SectionHeader
							title={t("recommendationsTitle")}
							subtitle={t("recommendationsSub")}
						/>

						{recsError && <ErrorBanner message={recsError} />}

						{!recsError && (
							<DataTable<Recommendation>
								columns={[
									{
										key: "topic",
										label: t("topic"),
										sortable: true,
										render: (rec) => (
											<span className="font-medium text-zinc-900 dark:text-zinc-100">
												{rec.topic}
											</span>
										),
									},
									{
										key: "query_count",
										label: t("queryCount"),
										sortable: true,
										align: "right",
										width: "w-24",
										render: (rec) => (
											<span className="tabular-nums text-zinc-600 dark:text-zinc-400">
												{rec.query_count}
											</span>
										),
									},
									{
										key: "priority",
										label: t("priority"),
										sortable: true,
										align: "right",
										width: "w-28",
										render: (rec) => (
											<Badge
												variant={
													rec.priority === "high"
														? "danger"
														: rec.priority === "medium"
															? "warning"
															: "default"
												}
											>
												{rec.priority === "high"
													? t("priorityHigh")
													: rec.priority === "medium"
														? t("priorityMedium")
														: t("priorityLow")}
											</Badge>
										),
									},
								]}
								data={recommendations}
								isLoading={recsLoading}
								loadingRows={5}
								rowKey={(rec) => rec.topic}
								emptyState={
									<EmptyState
										icon={
											<svg
												className="w-6 h-6"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={1.5}
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
												/>
											</svg>
										}
										title={t("noData")}
									/>
								}
							/>
						)}
					</section>

					{/* ── Section 3: Ingestion Status ───────────────────────── */}
					<section>
						<SectionHeader
							title={t("ingestionTitle")}
							subtitle={t("ingestionSub")}
						/>

						{ingestionError && <ErrorBanner message={ingestionError} />}

						{!ingestionError && (
							<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{ingestionLoading ? (
									<>
										<SkeletonCard />
										<SkeletonCard />
										<SkeletonCard />
									</>
								) : ingestionStatus.length === 0 ? (
									<div className="col-span-full">
										<EmptyState
											icon={
												<svg
													className="w-6 h-6"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													strokeWidth={1.5}
													aria-hidden="true"
												>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
													/>
												</svg>
											}
											title={t("noData")}
										/>
									</div>
								) : (
									ingestionStatus.map((item) => (
										<IngestionCard key={item.connector} item={item} />
									))
								)}
							</div>
						)}
					</section>

					{/* ── Section 4: Agent Logs ─────────────────────────────── */}
					<section>
						<SectionHeader title={t("logsTitle")} subtitle={t("logsSub")} />

						{activeCluster && (
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
								Showing filtered results for &ldquo;{activeCluster}&rdquo; (
								{filteredLogs.length} entries)
							</p>
						)}

						{logsError && <ErrorBanner message={logsError} />}

						{!logsError && (
							<div className="space-y-3">
								<DataTable<LogEntry>
									columns={logColumns}
									data={filteredLogs}
									isLoading={logsLoading}
									loadingRows={8}
									rowKey={(entry) => entry.id}
									emptyState={
										<EmptyState
											icon={<LogsEmptyIcon />}
											title={t("noData")}
											subtitle={
												activeCluster
													? `No log entries match the cluster "${activeCluster}". Try clearing the filter.`
													: undefined
											}
											action={
												activeCluster
													? {
															label: "Clear filter",
															onClick: () => setActiveCluster(null),
														}
													: undefined
											}
										/>
									}
								/>

								{/* Pagination — only shown when not filtering by cluster */}
								{!logsLoading && !activeCluster && logsTotal > PAGE_SIZE && (
									<Pagination
										page={logsPage}
										totalPages={totalPages}
										onPageChange={setLogsPage}
										totalItems={logsTotal}
										className="mt-3 px-1"
									/>
								)}
							</div>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
