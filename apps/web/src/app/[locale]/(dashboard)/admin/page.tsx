"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface KnowledgeSource {
	id: string;
	label: string;
	status: "active" | "inactive" | string;
	document_count: number;
	last_synced_at: string | null;
}

type IngestState = "idle" | "loading" | "success" | "error";

// ---- Icon map -------------------------------------------------------------

function ConnectorIcon({ id }: { id: string }) {
	switch (id) {
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
		case "confluence":
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
						d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
					/>
				</svg>
			);
		case "slack":
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
						d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
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

// ---- Skeleton card --------------------------------------------------------

function SkeletonCard() {
	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none animate-pulse">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-stone-200 dark:bg-stone-700" />
				<div className="flex-1 min-w-0 space-y-2">
					<div className="h-4 w-32 bg-stone-200 dark:bg-stone-700 rounded" />
					<div className="h-3 w-48 bg-stone-100 dark:bg-stone-600 rounded" />
					<div className="h-3 w-24 bg-stone-100 dark:bg-stone-600 rounded" />
				</div>
			</div>
		</div>
	);
}

// ---- Connector card -------------------------------------------------------

function ConnectorCard({
	source,
	onIngest,
	ingestState,
}: {
	source: KnowledgeSource;
	onIngest: (id: string) => void;
	ingestState: IngestState;
}) {
	const t = useTranslations("admin");

	const isActive = source.status === "active";

	const lastSyncedText = source.last_synced_at
		? t("lastSynced", {
				time: new Date(source.last_synced_at).toLocaleString(undefined, {
					dateStyle: "medium",
					timeStyle: "short",
				}),
			})
		: t("neverSynced");

	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
					<ConnectorIcon id={source.id} />
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<h3 className="font-semibold text-stone-900 dark:text-stone-100">
							{source.label}
						</h3>
						<span
							className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${
								isActive
									? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800"
									: "text-stone-500 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-700 dark:border-stone-600"
							}`}
						>
							<span
								className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-stone-400"}`}
							/>
							{isActive ? t("statusActive") : t("statusInactive")}
						</span>
					</div>

					<p className="text-sm text-stone-500 dark:text-stone-400">
						{t("documents", { count: source.document_count })}
					</p>
					<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
						{lastSyncedText}
					</p>

					{/* Ingest feedback */}
					{ingestState === "success" && (
						<p className="text-xs font-medium text-green-600 dark:text-green-400 mt-2">
							{t("ingestSuccess")}
						</p>
					)}
					{ingestState === "error" && (
						<p className="text-xs font-medium text-red-600 dark:text-red-400 mt-2">
							{t("ingestError")}
						</p>
					)}

					{/* Ingest button */}
					<button
						type="button"
						disabled={ingestState === "loading"}
						onClick={() => onIngest(source.id)}
						className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors
							bg-indigo-50 border-indigo-200 text-indigo-700
							hover:bg-indigo-100 hover:border-indigo-300
							dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300
							dark:hover:bg-indigo-900/50 dark:hover:border-indigo-700
							disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{ingestState === "loading" ? (
							<>
								<svg
									className="w-3.5 h-3.5 animate-spin"
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
								{t("ingesting")}
							</>
						) : (
							<>
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
										d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
									/>
								</svg>
								{t("ingest")}
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}

// ---- Static section card (Usage Analytics — kept as-is) ------------------

function SectionCard({
	title,
	description,
	comingSoon,
	icon,
}: {
	title: string;
	description: string;
	comingSoon: string;
	icon: React.ReactNode;
}) {
	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
					{icon}
				</div>
				<div className="flex-1 min-w-0">
					<h3 className="font-semibold text-stone-900 dark:text-stone-100 mb-1">
						{title}
					</h3>
					<p className="text-sm text-stone-500 dark:text-stone-400 mb-4">
						{description}
					</p>
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
						{comingSoon}
					</span>
				</div>
			</div>
		</div>
	);
}

// ---- Page ----------------------------------------------------------------

export default function AdminPage() {
	const t = useTranslations("admin");
	const tCommon = useTranslations("common");
	const { data: session } = useSession();

	const [sources, setSources] = useState<KnowledgeSource[]>([]);
	const [sourcesLoading, setSourcesLoading] = useState(true);
	const [sourcesError, setSourcesError] = useState<string | null>(null);
	const [ingestStates, setIngestStates] = useState<Record<string, IngestState>>(
		{},
	);

	const getAccessToken = useCallback(() => {
		return (
			(session as { accessToken?: string } | null)?.accessToken ?? "dev-token"
		);
	}, [session]);

	// Fetch knowledge sources on mount
	useEffect(() => {
		let cancelled = false;

		async function loadSources() {
			setSourcesLoading(true);
			setSourcesError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/knowledge/sources`, {
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
					},
				});

				if (!res.ok) {
					throw new Error(`${res.status} ${res.statusText}`);
				}

				const data: KnowledgeSource[] = await res.json();
				if (!cancelled) {
					setSources(data);
				}
			} catch {
				if (!cancelled) {
					setSourcesError(t("loadError"));
				}
			} finally {
				if (!cancelled) {
					setSourcesLoading(false);
				}
			}
		}

		loadSources();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, t]);

	// Trigger ingestion for a connector
	const handleIngest = useCallback(
		async (sourceId: string) => {
			setIngestStates((prev) => ({ ...prev, [sourceId]: "loading" }));
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/knowledge/ingest`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${getAccessToken()}`,
					},
					body: JSON.stringify({ connector: sourceId }),
				});

				if (!res.ok) {
					throw new Error(`${res.status}`);
				}

				setIngestStates((prev) => ({ ...prev, [sourceId]: "success" }));

				// Reset feedback after 4 seconds
				setTimeout(() => {
					setIngestStates((prev) => ({ ...prev, [sourceId]: "idle" }));
				}, 4000);
			} catch {
				setIngestStates((prev) => ({ ...prev, [sourceId]: "error" }));

				setTimeout(() => {
					setIngestStates((prev) => ({ ...prev, [sourceId]: "idle" }));
				}, 4000);
			}
		},
		[getAccessToken],
	);

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900/80 px-6 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto space-y-8">
					{/* Data Sources section */}
					<section>
						<div className="flex items-center justify-between mb-4">
							<div>
								<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
									{t("dataSources")}
								</h2>
								<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
									{t("dataSourcesSub")}
								</p>
							</div>
						</div>

						{/* Error state */}
						{sourcesError && (
							<div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
								{sourcesError}
							</div>
						)}

						<div className="grid gap-4 sm:grid-cols-2">
							{sourcesLoading ? (
								<>
									<SkeletonCard />
									<SkeletonCard />
									<SkeletonCard />
									<SkeletonCard />
								</>
							) : (
								sources.map((source) => (
									<ConnectorCard
										key={source.id}
										source={source}
										onIngest={handleIngest}
										ingestState={ingestStates[source.id] ?? "idle"}
									/>
								))
							)}
						</div>
					</section>

					{/* Usage Analytics section — static, coming soon */}
					<section>
						<div className="mb-4">
							<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
								{t("usageAnalytics")}
							</h2>
							<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
								{t("usageAnalyticsSub")}
							</p>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<SectionCard
								title={t("queryAnalytics")}
								description={t("queryAnalyticsSub")}
								comingSoon={tCommon("comingSoon")}
								icon={
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
											d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
										/>
									</svg>
								}
							/>
							<SectionCard
								title={t("userActivity")}
								description={t("userActivitySub")}
								comingSoon={tCommon("comingSoon")}
								icon={
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
											d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
										/>
									</svg>
								}
							/>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
