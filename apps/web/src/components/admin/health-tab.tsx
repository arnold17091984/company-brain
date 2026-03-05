"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface HealthCheck {
	service: string;
	status: "healthy" | "degraded" | "down" | string;
	latency_ms: number;
}

// ---- HealthCard -----------------------------------------------------------

function HealthCard({ check }: { check: HealthCheck }) {
	const t = useTranslations("admin");

	const dotColour =
		check.status === "healthy"
			? "bg-green-500"
			: check.status === "degraded"
				? "bg-amber-500"
				: "bg-red-500";

	const borderColour =
		check.status === "healthy"
			? "border-green-200 dark:border-green-800"
			: check.status === "degraded"
				? "border-amber-200 dark:border-amber-800"
				: "border-red-200 dark:border-red-800";

	const statusLabel =
		check.status === "healthy"
			? t("healthy")
			: check.status === "degraded"
				? t("degraded")
				: t("down");

	const statusTextColour =
		check.status === "healthy"
			? "text-green-700 dark:text-green-400"
			: check.status === "degraded"
				? "text-amber-700 dark:text-amber-400"
				: "text-red-700 dark:text-red-400";

	return (
		<div
			className={`bg-white dark:bg-[#1a1a1f] rounded-2xl border p-5 ${borderColour}`}
		>
			<div className="flex items-center gap-2.5 mb-3">
				<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColour}`} />
				<span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 capitalize">
					{check.service}
				</span>
			</div>
			<p className={`text-sm font-medium ${statusTextColour}`}>{statusLabel}</p>
			{check.latency_ms > 0 && (
				<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					{t("latency", { ms: check.latency_ms.toFixed(1) })}
				</p>
			)}
		</div>
	);
}

// ---- HealthTab ------------------------------------------------------------

export function HealthTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [checks, setChecks] = useState<HealthCheck[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/health`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: HealthCheck[] = await res.json();
				if (!cancelled) setChecks(data);
			} catch {
				if (!cancelled) setError(t("loadError"));
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, t]);

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
					{t("healthTitle")}
				</h2>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("healthSub")}
				</p>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-3">
				{loading
					? (["skel-pg", "skel-qdrant", "skel-redis"] as const).map((key) => (
							<div
								key={key}
								className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5 animate-pulse"
							>
								<div className="flex items-center gap-3 mb-3">
									<div className="w-3 h-3 rounded-full bg-zinc-200 dark:bg-white/[0.06]" />
									<div className="h-4 w-24 bg-zinc-200 dark:bg-white/[0.06] rounded" />
								</div>
								<div className="h-3 w-16 bg-zinc-100 dark:bg-white/[0.04] rounded" />
							</div>
						))
					: checks.map((check) => (
							<HealthCard key={check.service} check={check} />
						))}
			</div>
		</div>
	);
}
