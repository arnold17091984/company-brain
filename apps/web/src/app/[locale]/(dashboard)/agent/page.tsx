"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

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

// ---- Helpers ---------------------------------------------------------------

function priorityOrder(p: Recommendation["priority"]): number {
	if (p === "high") return 0;
	if (p === "medium") return 1;
	return 2;
}

function formatTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
}

// ---- Sub-components --------------------------------------------------------

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

function SkeletonCard() {
	return (
		<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5 animate-pulse">
			<div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
			<div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-600 rounded mb-3" />
			<div className="space-y-1.5">
				<div className="h-3 w-full bg-zinc-100 dark:bg-zinc-600 rounded" />
				<div className="h-3 w-4/5 bg-zinc-100 dark:bg-zinc-600 rounded" />
				<div className="h-3 w-3/5 bg-zinc-100 dark:bg-zinc-600 rounded" />
			</div>
		</div>
	);
}

function ErrorBanner({ message }: { message: string }) {
	return (
		<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
			{message}
		</div>
	);
}

// ---- Cluster Card ----------------------------------------------------------

function ClusterCard({ cluster }: { cluster: Cluster }) {
	const t = useTranslations("agent");

	return (
		<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5">
			<div className="flex items-start justify-between gap-3 mb-3">
				<h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm leading-snug">
					{cluster.label}
				</h3>
				<span className="shrink-0 inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
					{t("queries", { count: cluster.count })}
				</span>
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
		</div>
	);
}

// ---- Priority Badge --------------------------------------------------------

function PriorityBadge({
	priority,
}: {
	priority: Recommendation["priority"];
}) {
	const t = useTranslations("agent");

	const styles: Record<Recommendation["priority"], string> = {
		high: "text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800",
		medium:
			"text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",
		low: "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800",
	};

	const labels: Record<Recommendation["priority"], string> = {
		high: t("priorityHigh"),
		medium: t("priorityMedium"),
		low: t("priorityLow"),
	};

	return (
		<span
			className={`inline-flex items-center text-xs font-medium rounded-full px-2.5 py-0.5 border ${styles[priority]}`}
		>
			{labels[priority]}
		</span>
	);
}

// ---- Ingestion Status Card -------------------------------------------------

function IngestionCard({ item }: { item: IngestionStatus }) {
	const t = useTranslations("agent");

	const isActive = item.status === "active";

	const lastSyncedText = item.last_synced
		? t("lastSynced", {
				time: new Date(item.last_synced).toLocaleString(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				}),
			})
		: t("neverSynced");

	const connectorLabel =
		item.connector === "google_drive"
			? "Google Drive"
			: item.connector.charAt(0).toUpperCase() +
				item.connector.slice(1).replace(/_/g, " ");

	return (
		<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-5">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
					<ConnectorIcon connector={item.connector} />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
							{connectorLabel}
						</h3>
						<span
							className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${
								isActive
									? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800"
									: "text-zinc-500 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-zinc-700 dark:border-zinc-600"
							}`}
						>
							<span
								className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-zinc-400"}`}
							/>
							{isActive ? "Active" : "Inactive"}
						</span>
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

// ---- Connector Icon --------------------------------------------------------

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

// ---- Page ------------------------------------------------------------------

export default function AgentPage() {
	const t = useTranslations("agent");
	const { data: session } = useSession();

	// ---- Clusters state
	const [clusters, setClusters] = useState<Cluster[]>([]);
	const [clustersLoading, setClustersLoading] = useState(true);
	const [clustersError, setClustersError] = useState<string | null>(null);

	// ---- Recommendations state
	const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
	const [recsLoading, setRecsLoading] = useState(true);
	const [recsError, setRecsError] = useState<string | null>(null);

	// ---- Ingestion status state
	const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus[]>([]);
	const [ingestionLoading, setIngestionLoading] = useState(true);
	const [ingestionError, setIngestionError] = useState<string | null>(null);

	// ---- Logs state
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [logsLoading, setLogsLoading] = useState(true);
	const [logsError, setLogsError] = useState<string | null>(null);
	const [logsPage, setLogsPage] = useState(1);
	const [logsTotal, setLogsTotal] = useState(0);
	const PAGE_SIZE = 50;

	// ---- Auth token
	const getAccessToken = useCallback(() => {
		return (
			(session as { accessToken?: string } | null)?.accessToken ?? "dev-token"
		);
	}, [session]);

	// ---- Fetch clusters
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setClustersLoading(true);
			setClustersError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/analytics/clusters`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
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
	}, [getAccessToken]);

	// ---- Fetch recommendations
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setRecsLoading(true);
			setRecsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/recommendations`,
					{
						headers: { Authorization: `Bearer ${getAccessToken()}` },
					},
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
	}, [getAccessToken]);

	// ---- Fetch ingestion status
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIngestionLoading(true);
			setIngestionError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/ingestion-status`,
					{
						headers: { Authorization: `Bearer ${getAccessToken()}` },
					},
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
	}, [getAccessToken]);

	// ---- Fetch logs
	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLogsLoading(true);
			setLogsError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/analytics/logs?page=${logsPage}&page_size=${PAGE_SIZE}`,
					{
						headers: { Authorization: `Bearer ${getAccessToken()}` },
					},
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
	}, [getAccessToken, logsPage]);

	const totalPages = Math.max(1, Math.ceil(logsTotal / PAGE_SIZE));

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-5">
				<div className="max-w-5xl mx-auto space-y-10">
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
									<p className="text-sm text-zinc-500 dark:text-zinc-400 col-span-full">
										{t("noData")}
									</p>
								) : (
									clusters.map((cluster) => (
										<ClusterCard key={cluster.label} cluster={cluster} />
									))
								)}
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
							<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-700/30">
											<th className="px-5 py-3 text-left text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
												{t("topic")}
											</th>
											<th className="px-5 py-3 text-right text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
												{t("queryCount")}
											</th>
											<th className="px-5 py-3 text-right text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
												{t("priority")}
											</th>
										</tr>
									</thead>
									<tbody>
										{recsLoading ? (
											["r0", "r1", "r2", "r3", "r4"].map((k) => (
												<tr
													key={k}
													className="border-b border-zinc-100 dark:border-zinc-800 animate-pulse"
												>
													<td className="px-5 py-3">
														<div className="h-3 w-48 bg-zinc-200 dark:bg-zinc-700 rounded" />
													</td>
													<td className="px-5 py-3 text-right">
														<div className="h-3 w-10 bg-zinc-200 dark:bg-zinc-700 rounded ml-auto" />
													</td>
													<td className="px-5 py-3 text-right">
														<div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full ml-auto" />
													</td>
												</tr>
											))
										) : recommendations.length === 0 ? (
											<tr>
												<td
													colSpan={3}
													className="px-5 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
												>
													{t("noData")}
												</td>
											</tr>
										) : (
											recommendations.map((rec) => (
												<tr
													key={rec.topic}
													className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 transition-colors"
												>
													<td className="px-5 py-3 text-zinc-900 dark:text-zinc-100 font-medium">
														{rec.topic}
													</td>
													<td className="px-5 py-3 text-right text-zinc-600 dark:text-zinc-400 tabular-nums">
														{rec.query_count}
													</td>
													<td className="px-5 py-3 text-right">
														<PriorityBadge priority={rec.priority} />
													</td>
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
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
									<p className="text-sm text-zinc-500 dark:text-zinc-400 col-span-full">
										{t("noData")}
									</p>
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

						{logsError && <ErrorBanner message={logsError} />}

						{!logsError && (
							<>
								<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
									<div className="overflow-x-auto">
										<table className="w-full text-sm">
											<thead>
												<tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-700/30">
													<th className="px-5 py-3 text-left text-[11px] font-medium text-zinc-400 uppercase tracking-widest whitespace-nowrap">
														{t("logTime")}
													</th>
													<th className="px-5 py-3 text-left text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
														{t("logUser")}
													</th>
													<th className="px-5 py-3 text-left text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
														{t("logAction")}
													</th>
													<th className="px-5 py-3 text-left text-[11px] font-medium text-zinc-400 uppercase tracking-widest">
														{t("logQuery")}
													</th>
												</tr>
											</thead>
											<tbody>
												{logsLoading ? (
													["l0", "l1", "l2", "l3", "l4", "l5", "l6", "l7"].map(
														(k) => (
															<tr
																key={k}
																className="border-b border-zinc-100 dark:border-zinc-800 animate-pulse"
															>
																<td className="px-5 py-3">
																	<div className="h-3 w-28 bg-zinc-200 dark:bg-zinc-700 rounded" />
																</td>
																<td className="px-5 py-3">
																	<div className="h-3 w-36 bg-zinc-200 dark:bg-zinc-700 rounded" />
																</td>
																<td className="px-5 py-3">
																	<div className="h-3 w-20 bg-zinc-200 dark:bg-zinc-700 rounded" />
																</td>
																<td className="px-5 py-3">
																	<div className="h-3 w-52 bg-zinc-200 dark:bg-zinc-700 rounded" />
																</td>
															</tr>
														),
													)
												) : logs.length === 0 ? (
													<tr>
														<td
															colSpan={4}
															className="px-5 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
														>
															{t("noData")}
														</td>
													</tr>
												) : (
													logs.map((entry) => (
														<tr
															key={entry.id}
															className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 transition-colors"
														>
															<td className="px-5 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap tabular-nums text-xs">
																{formatTime(entry.created_at)}
															</td>
															<td className="px-5 py-3 text-zinc-700 dark:text-zinc-300 truncate max-w-[12rem]">
																{entry.user_email}
															</td>
															<td className="px-5 py-3">
																<span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
																	{entry.action}
																</span>
															</td>
															<td className="px-5 py-3 text-zinc-600 dark:text-zinc-400 truncate max-w-[20rem]">
																{entry.query ?? (
																	<span className="text-zinc-400 dark:text-zinc-600 italic text-xs">
																		—
																	</span>
																)}
															</td>
														</tr>
													))
												)}
											</tbody>
										</table>
									</div>
								</div>

								{/* Pagination */}
								{!logsLoading && logsTotal > PAGE_SIZE && (
									<div className="flex items-center justify-between mt-3 px-1">
										<p className="text-xs text-zinc-500 dark:text-zinc-400">
											Page {logsPage} of {totalPages}
										</p>
										<div className="flex items-center gap-2">
											<button
												type="button"
												disabled={logsPage <= 1}
												onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
												className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
													bg-white border-zinc-200 text-zinc-700
													hover:bg-zinc-50 hover:border-zinc-300
													dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300
													dark:hover:bg-zinc-700 dark:hover:border-zinc-600
													disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<svg
													className="w-3.5 h-3.5"
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
												Prev
											</button>
											<button
												type="button"
												disabled={logsPage >= totalPages}
												onClick={() =>
													setLogsPage((p) => Math.min(totalPages, p + 1))
												}
												className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
													bg-white border-zinc-200 text-zinc-700
													hover:bg-zinc-50 hover:border-zinc-300
													dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300
													dark:hover:bg-zinc-700 dark:hover:border-zinc-600
													disabled:opacity-40 disabled:cursor-not-allowed"
											>
												Next
												<svg
													className="w-3.5 h-3.5"
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
											</button>
										</div>
									</div>
								)}
							</>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}
