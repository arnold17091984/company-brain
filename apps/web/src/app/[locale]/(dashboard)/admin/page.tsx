"use client";

import { DataSourcesTab } from "@/components/admin/datasources-tab";
import { HarvestTab } from "@/components/admin/harvest-tab";
import { HealthTab } from "@/components/admin/health-tab";
import { KnowledgeTab } from "@/components/admin/knowledge-tab";
import { RecipesTab } from "@/components/admin/recipes-tab";
import { SafetyTab } from "@/components/admin/safety-tab";
import { SettingsTab } from "@/components/admin/settings-tab";
import { UsersTab } from "@/components/admin/users-tab";
import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
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

type TabId =
	| "datasources"
	| "settings"
	| "users"
	| "health"
	| "safety"
	| "recipes"
	| "knowledge"
	| "harvest";

// ---- AdminPage ------------------------------------------------------------

export default function AdminPage() {
	const t = useTranslations("admin");
	const locale = useLocale();
	const { data: session, status: sessionStatus } = useSession();

	const [activeTab, setActiveTab] = useState<TabId>("datasources");
	const [sources, setSources] = useState<KnowledgeSource[]>([]);
	const [sourcesLoading, setSourcesLoading] = useState(true);
	const [sourcesError, setSourcesError] = useState<string | null>(null);
	const [ingestStates, setIngestStates] = useState<Record<string, IngestState>>(
		{},
	);

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	// Fetch knowledge sources on mount
	useEffect(() => {
		let cancelled = false;

		async function loadSources() {
			setSourcesLoading(true);
			setSourcesError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/knowledge/sources`, {
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: KnowledgeSource[] = await res.json();
				if (!cancelled) setSources(data);
			} catch {
				if (!cancelled) setSourcesError(t("loadError"));
			} finally {
				if (!cancelled) setSourcesLoading(false);
			}
		}

		loadSources();
		return () => {
			cancelled = true;
		};
	}, [getToken, t]);

	// Trigger ingestion for a connector
	const handleIngest = useCallback(
		async (sourceId: string) => {
			setIngestStates((prev) => ({ ...prev, [sourceId]: "loading" }));
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/knowledge/ingest?connector_type=${encodeURIComponent(sourceId)}`,
					{
						method: "POST",
						headers: { Authorization: `Bearer ${getToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status}`);
				setIngestStates((prev) => ({ ...prev, [sourceId]: "success" }));
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
		[getToken],
	);

	const tabs: { id: TabId; label: string }[] = [
		{ id: "datasources", label: t("tabDataSources") },
		{ id: "settings", label: t("tabSettings") },
		{ id: "users", label: t("tabUsers") },
		{ id: "health", label: t("tabHealth") },
		{ id: "safety", label: t("tabSafety") },
		{ id: "recipes", label: t("tabRecipes") },
		{ id: "knowledge", label: t("tabKnowledge") },
		{ id: "harvest", label: t("tabHarvest") },
	];

	// Suppress hydration mismatch: wait for session to load on client
	if (sessionStatus === "loading") {
		return null;
	}

	// Role guard - only admin users can access this page
	if (session?.user?.role && session.user.role !== "admin") {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<h2 className="text-xl font-medium text-zinc-900 dark:text-zinc-100">
						{t("accessDenied")}
					</h2>
					<p className="text-zinc-500 dark:text-zinc-400 mt-2">
						{t("accessDeniedDesc")}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="bg-transparent px-4 sm:px-8 py-4 shrink-0">
				<h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
					{t("subtitle")}
				</p>
			</div>

			{/* Tab bar */}
			<div className="bg-transparent px-4 sm:px-8 py-3 shrink-0 border-b border-zinc-200/60 dark:border-white/[0.04] overflow-x-auto">
				<div
					className="bg-zinc-100/80 dark:bg-white/[0.04] rounded-xl p-1 inline-flex gap-0.5 min-w-max"
					role="tablist"
					aria-label="Admin tabs"
				>
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							role="tab"
							aria-selected={activeTab === tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`min-h-[44px] px-3 py-1.5 text-sm transition-colors duration-150 whitespace-nowrap flex items-center active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
								activeTab === tab.id
									? "bg-white dark:bg-white/[0.1] rounded-lg shadow-sm text-zinc-950 dark:text-zinc-100 font-medium"
									: "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-y-auto p-4 sm:p-8">
				<div
					className={`animate-fade-in ${
						activeTab === "users" || activeTab === "safety"
							? "max-w-5xl mx-auto w-full"
							: "max-w-4xl mx-auto w-full"
					}`}
				>
					{activeTab === "datasources" && (
						<DataSourcesTab
							sources={sources}
							sourcesLoading={sourcesLoading}
							sourcesError={sourcesError}
							ingestStates={ingestStates}
							onIngest={handleIngest}
							locale={locale}
							getAccessToken={getToken}
						/>
					)}
					{activeTab === "settings" && (
						<SettingsTab getAccessToken={getToken} />
					)}
					{activeTab === "users" && <UsersTab getAccessToken={getToken} />}
					{activeTab === "health" && <HealthTab getAccessToken={getToken} />}
					{activeTab === "safety" && <SafetyTab getAccessToken={getToken} />}
					{activeTab === "recipes" && <RecipesTab getAccessToken={getToken} />}
					{activeTab === "knowledge" && (
						<KnowledgeTab getAccessToken={getToken} />
					)}
					{activeTab === "harvest" && <HarvestTab getAccessToken={getToken} />}
				</div>
			</div>
		</div>
	);
}
