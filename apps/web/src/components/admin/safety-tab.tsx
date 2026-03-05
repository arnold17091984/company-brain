"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface SafetyViolation {
	id: string;
	user_email: string;
	violation_type: string;
	risk_level: "high" | "medium" | "low" | string;
	detected_categories: string[];
	context_snippet: string;
	action_taken: string;
	created_at: string;
	resolved_at: string | null;
	resolved_by: string | null;
}

interface SafetyStats {
	total_violations: number;
	violations_today: number;
	blocked_count: number;
	masked_count: number;
	warned_count: number;
	top_violation_types: { type: string; count: number }[];
}

// ---- StatCard -------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
			<p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
				{label}
			</p>
			<p className="text-2xl font-medium text-zinc-900 dark:text-zinc-100">
				{value.toLocaleString()}
			</p>
		</div>
	);
}

// ---- SafetyTab ------------------------------------------------------------

export function SafetyTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("safety");
	const tAdmin = useTranslations("admin");
	const [stats, setStats] = useState<SafetyStats | null>(null);
	const [violations, setViolations] = useState<SafetyViolation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [resolvingId, setResolvingId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const headers = { Authorization: `Bearer ${getAccessToken()}` };
				const [statsRes, violationsRes] = await Promise.all([
					fetch(`${API_BASE_URL}/api/v1/admin/safety/stats`, { headers }),
					fetch(`${API_BASE_URL}/api/v1/admin/safety/violations?limit=50`, {
						headers,
					}),
				]);
				if (!statsRes.ok) throw new Error(`${statsRes.status}`);
				if (!violationsRes.ok) throw new Error(`${violationsRes.status}`);
				const statsData: SafetyStats = await statsRes.json();
				const violationsData: { violations: SafetyViolation[]; total: number } =
					await violationsRes.json();
				if (!cancelled) {
					setStats(statsData);
					setViolations(violationsData.violations);
				}
			} catch {
				if (!cancelled) setError(tAdmin("loadError"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, tAdmin]);

	const handleResolve = async (id: string) => {
		setResolvingId(id);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/safety/violations/${id}/resolve`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				},
			);
			if (!res.ok) throw new Error(`${res.status}`);
			setViolations((prev) =>
				prev.map((v) =>
					v.id === id ? { ...v, resolved_at: new Date().toISOString() } : v,
				),
			);
		} catch {
			// silently ignore
		} finally {
			setResolvingId(null);
		}
	};

	const riskBadgeClass = (level: string) => {
		if (level === "high")
			return "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800";
		if (level === "medium")
			return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800";
		return "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800";
	};

	const actionBadgeClass = (action: string) => {
		if (action === "blocked")
			return "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800";
		if (action === "masked")
			return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800";
		return "text-zinc-600 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-[#1e1e24] dark:border-white/[0.06]";
	};

	const riskLabel = (level: string) => {
		if (level === "high") return t("riskHigh");
		if (level === "medium") return t("riskMedium");
		return t("riskLow");
	};

	return (
		<div className="space-y-6 animate-fade-in">
			<div>
				<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h2>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Stats cards */}
			<div className="grid gap-4 sm:grid-cols-4">
				{loading ? (
					(["s0", "s1", "s2", "s3"] as const).map((key) => (
						<div
							key={key}
							className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5"
						>
							<Skeleton height="0.75rem" width="6rem" className="mb-3" />
							<Skeleton height="1.75rem" width="3rem" />
						</div>
					))
				) : stats ? (
					<>
						<StatCard
							label={t("totalViolations")}
							value={stats.total_violations}
						/>
						<StatCard
							label={t("violationsToday")}
							value={stats.violations_today}
						/>
						<StatCard label={t("blocked")} value={stats.blocked_count} />
						<StatCard label={t("masked")} value={stats.masked_count} />
					</>
				) : null}
			</div>

			{/* Top violation types */}
			{!loading && stats && stats.top_violation_types.length > 0 && (
				<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
					<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
						{t("topTypes")}
					</h3>
					<div className="space-y-3">
						{stats.top_violation_types.map(({ type, count }) => {
							const max = stats.top_violation_types[0]?.count ?? 1;
							const pct = Math.round((count / max) * 100);
							return (
								<div key={type}>
									<div className="flex items-center justify-between mb-1">
										<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 capitalize">
											{type.replace(/_/g, " ")}
										</span>
										<span className="text-xs text-zinc-500 dark:text-zinc-400">
											{count}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.06] overflow-hidden">
										<div
											className="h-full rounded-full bg-indigo-500 dark:bg-indigo-400"
											style={{ width: `${pct}%` }}
										/>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* Violations table */}
			<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] overflow-hidden">
				<div className="px-6 py-4 border-b border-zinc-100 dark:border-white/[0.04]">
					<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
						{t("violations")}
					</h3>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-zinc-200 dark:divide-white/[0.04]">
						<thead className="bg-zinc-50 dark:bg-white/[0.02]">
							<tr>
								{[
									t("stats"),
									"Type",
									t("riskHigh").replace("High", "Risk"),
									"Action",
									"Time",
									"",
								].map((col, i) => (
									<th
										key={`th-${
											// biome-ignore lint/suspicious/noArrayIndexKey: stable header indices
											i
										}`}
										className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider"
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
							{loading ? (
								(["vr0", "vr1", "vr2", "vr3"] as const).map((rowKey) => (
									<tr key={rowKey}>
										{(["vc0", "vc1", "vc2", "vc3", "vc4", "vc5"] as const).map(
											(colKey) => (
												<td key={colKey} className="px-4 py-3">
													<Skeleton height="0.75rem" width="5rem" />
												</td>
											),
										)}
									</tr>
								))
							) : violations.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-4 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500"
									>
										—
									</td>
								</tr>
							) : (
								violations.map((v, _vIdx) => (
									<tr
										key={v.id}
										style={{
											animationDelay: `${_vIdx * 40}ms`,
											animationFillMode: "forwards",
										}}
										className="hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors animate-fade-in opacity-0"
									>
										<td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap max-w-[160px] truncate">
											{v.user_email}
										</td>
										<td className="px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 capitalize whitespace-nowrap">
											{v.violation_type.replace(/_/g, " ")}
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${riskBadgeClass(v.risk_level)}`}
											>
												{riskLabel(v.risk_level)}
											</span>
										</td>
										<td className="px-4 py-3">
											<span
												className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${actionBadgeClass(v.action_taken)}`}
											>
												{v.action_taken}
											</span>
										</td>
										<td className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
											{new Date(v.created_at).toLocaleString(undefined, {
												dateStyle: "short",
												timeStyle: "short",
											})}
										</td>
										<td className="px-4 py-3 text-right whitespace-nowrap">
											{v.resolved_at ? (
												<span className="text-xs text-green-600 dark:text-green-400 font-medium">
													{t("resolved")}
												</span>
											) : (
												<button
													type="button"
													disabled={resolvingId === v.id}
													onClick={() => handleResolve(v.id)}
													className="min-h-[44px] inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-xl border transition-[colors,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 dark:bg-indigo-500/[0.08] dark:border-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/[0.15] dark:hover:border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
												>
													{resolvingId === v.id ? (
														<svg
															className="w-3 h-3 animate-spin"
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
													) : null}
													{t("resolve")}
												</button>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
