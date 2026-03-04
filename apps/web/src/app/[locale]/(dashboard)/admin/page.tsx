"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
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
	| "knowledge";

interface SystemSettings {
	rag: {
		chunk_size: number;
		overlap: number;
		top_k: number;
	};
	llm: {
		default_model: string;
		temperature: number;
		max_tokens: number;
	};
	agent: {
		thinking_budget: number;
		confidence_threshold: number;
	};
}

interface UserSummary {
	id: string;
	email: string;
	name: string;
	department: string | null;
	department_id: string | null;
	access_level: string;
	role: string;
	created_at: string;
}

interface Department {
	id: string;
	name: string;
	slug: string;
	user_count: number;
}

interface HealthCheck {
	service: string;
	status: "healthy" | "degraded" | "down" | string;
	latency_ms: number;
}

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

interface PromotableQA {
	message_id: string;
	question: string;
	answer: string;
	upvote_count: number;
	session_id: string;
	user_email: string;
	created_at: string;
	already_promoted: boolean;
}

interface AIRecipe {
	id: string;
	title: string;
	description: string;
	prompt_template: string;
	example_query: string;
	example_response: string;
	department_name: string | null;
	category: string;
	effectiveness_score: number;
	usage_count: number;
	source: string;
	status: "draft" | "published" | "archived" | string;
	created_at: string;
}

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

// ---- Analytics link card --------------------------------------------------

function AnalyticsLinkCard({
	title,
	description,
	href,
	linkLabel,
	icon,
}: {
	title: string;
	description: string;
	href: string;
	linkLabel: string;
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
					<Link
						href={href}
						className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100 transition-colors dark:text-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-800 dark:hover:bg-indigo-900/50"
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
								d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
							/>
						</svg>
						{linkLabel}
					</Link>
				</div>
			</div>
		</div>
	);
}

// ---- Settings tab ---------------------------------------------------------

function SettingsTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [settings, setSettings] = useState<SystemSettings | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/settings`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: SystemSettings = await res.json();
				if (!cancelled) setSettings(data);
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

	const handleSave = async () => {
		if (!settings) return;
		setSaving(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/settings`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${getAccessToken()}`,
				},
				body: JSON.stringify(settings),
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const updated: SystemSettings = await res.json();
			setSettings(updated);
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch {
			setError(t("loadError"));
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 animate-pulse"
					>
						<div className="h-4 w-32 bg-stone-200 dark:bg-stone-700 rounded mb-4" />
						<div className="space-y-3">
							<div className="h-8 bg-stone-100 dark:bg-stone-600 rounded" />
							<div className="h-8 bg-stone-100 dark:bg-stone-600 rounded" />
						</div>
					</div>
				))}
			</div>
		);
	}

	if (!settings) return null;

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					{t("settingsTitle")}
				</h2>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("settingsSub")}
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* RAG section */}
			<section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
				<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">
					{t("ragSettings")}
				</h3>
				<div className="grid gap-4 sm:grid-cols-3">
					<SettingsField
						label={t("chunkSize")}
						value={settings.rag.chunk_size}
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, rag: { ...s.rag, chunk_size: Number(v) } } : s,
							)
						}
					/>
					<SettingsField
						label={t("overlap")}
						value={settings.rag.overlap}
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, rag: { ...s.rag, overlap: Number(v) } } : s,
							)
						}
					/>
					<SettingsField
						label={t("topK")}
						value={settings.rag.top_k}
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, rag: { ...s.rag, top_k: Number(v) } } : s,
							)
						}
					/>
				</div>
			</section>

			{/* LLM section */}
			<section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
				<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">
					{t("llmSettings")}
				</h3>
				<div className="grid gap-4 sm:grid-cols-3">
					<SettingsField
						label={t("defaultModel")}
						value={settings.llm.default_model}
						type="text"
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, llm: { ...s.llm, default_model: v } } : s,
							)
						}
					/>
					<SettingsField
						label={t("temperature")}
						value={settings.llm.temperature}
						step={0.1}
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, llm: { ...s.llm, temperature: Number(v) } } : s,
							)
						}
					/>
					<SettingsField
						label={t("maxTokens")}
						value={settings.llm.max_tokens}
						onChange={(v) =>
							setSettings((s) =>
								s ? { ...s, llm: { ...s.llm, max_tokens: Number(v) } } : s,
							)
						}
					/>
				</div>
			</section>

			{/* Agent section */}
			<section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
				<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">
					{t("agentSettings")}
				</h3>
				<div className="grid gap-4 sm:grid-cols-2">
					<SettingsField
						label={t("thinkingBudget")}
						value={settings.agent.thinking_budget}
						onChange={(v) =>
							setSettings((s) =>
								s
									? {
											...s,
											agent: { ...s.agent, thinking_budget: Number(v) },
										}
									: s,
							)
						}
					/>
					<SettingsField
						label={t("confidenceThreshold")}
						value={settings.agent.confidence_threshold}
						step={0.05}
						onChange={(v) =>
							setSettings((s) =>
								s
									? {
											...s,
											agent: {
												...s.agent,
												confidence_threshold: Number(v),
											},
										}
									: s,
							)
						}
					/>
				</div>
			</section>

			{/* Save button */}
			<div className="flex items-center gap-3">
				<button
					type="button"
					disabled={saving}
					onClick={handleSave}
					className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{saving ? (
						<svg
							className="w-4 h-4 animate-spin"
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
					{t("saveSettings")}
				</button>
				{saved && (
					<span className="text-sm font-medium text-green-600 dark:text-green-400">
						{t("settingsSaved")}
					</span>
				)}
			</div>
		</div>
	);
}

function SettingsField({
	label,
	value,
	type = "number",
	step,
	onChange,
}: {
	label: string;
	value: string | number;
	type?: "text" | "number";
	step?: number;
	onChange: (v: string) => void;
}) {
	// Derive a stable id from the label so the label's htmlFor associates
	// correctly with the input without needing an external id prop.
	const inputId = `sf-${label.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<div>
			<label
				htmlFor={inputId}
				className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5"
			>
				{label}
			</label>
			<input
				id={inputId}
				type={type}
				value={value}
				step={step}
				onChange={(e) => onChange(e.target.value)}
				className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
			/>
		</div>
	);
}

// ---- Users tab ------------------------------------------------------------

function UsersTab({ getAccessToken }: { getAccessToken: () => string }) {
	const t = useTranslations("admin");
	const [users, setUsers] = useState<UserSummary[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [editRole, setEditRole] = useState("");
	const [editAccessLevel, setEditAccessLevel] = useState("");
	const [editDepartmentId, setEditDepartmentId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: UserSummary[] = await res.json();
				if (!cancelled) setUsers(data);
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

	// Fetch departments for the edit form
	useEffect(() => {
		async function loadDepartments() {
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/departments`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (res.ok) {
					const data: Department[] = await res.json();
					setDepartments(data);
				}
			} catch {
				// Non-critical - departments dropdown will be empty
			}
		}
		loadDepartments();
	}, [getAccessToken]);

	// Sync edit fields when editingUser changes
	useEffect(() => {
		if (editingUser) {
			setEditRole(editingUser.role);
			setEditAccessLevel(editingUser.access_level);
			setEditDepartmentId(editingUser.department_id);
		}
	}, [editingUser]);

	const handleSaveUser = async () => {
		if (!editingUser) return;
		setSaving(true);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/users/${editingUser.id}`,
				{
					method: "PATCH",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${getAccessToken()}`,
					},
					body: JSON.stringify({
						role: editRole,
						access_level: editAccessLevel,
						department_id: editDepartmentId,
					}),
				},
			);
			if (!res.ok) throw new Error(`${res.status}`);
			// Refresh users list
			setEditingUser(null);
			const usersRes = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (usersRes.ok) {
				setUsers(await usersRes.json());
			}
		} catch {
			setError(t("loadError"));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					{t("usersTitle")}
				</h2>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("usersSub")}
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm dark:shadow-none overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-stone-200 dark:divide-stone-700">
						<thead className="bg-stone-50 dark:bg-stone-900/50">
							<tr>
								{[
									t("userName"),
									t("userEmail"),
									t("userDept"),
									t("userAccess"),
									t("userRole"),
									t("userJoined"),
									t("actions"),
								].map((col) => (
									<th
										key={col}
										className="px-4 py-3 text-left text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider"
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
							{loading ? (
								(["r0", "r1", "r2", "r3"] as const).map((rowKey) => (
									<tr key={rowKey} className="animate-pulse">
										{(["c0", "c1", "c2", "c3", "c4", "c5", "c6"] as const).map(
											(colKey) => (
												<td key={colKey} className="px-4 py-3">
													<div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-24" />
												</td>
											),
										)}
									</tr>
								))
							) : users.length === 0 ? (
								<tr>
									<td
										colSpan={7}
										className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500"
									>
										—
									</td>
								</tr>
							) : (
								users.map((user) => (
									<tr
										key={user.id}
										className="hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors"
									>
										<td className="px-4 py-3 text-sm font-medium text-stone-900 dark:text-stone-100 whitespace-nowrap">
											{user.name}
										</td>
										<td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
											{user.email}
										</td>
										<td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
											{user.department ?? "—"}
										</td>
										<td className="px-4 py-3">
											<AccessBadge level={user.access_level} />
										</td>
										<td className="px-4 py-3">
											<RoleBadge role={user.role} />
										</td>
										<td className="px-4 py-3 text-sm text-stone-500 dark:text-stone-500 whitespace-nowrap">
											{new Date(user.created_at).toLocaleDateString(undefined, {
												dateStyle: "medium",
											})}
										</td>
										<td className="px-4 py-3">
											<button
												type="button"
												onClick={() => setEditingUser(user)}
												className="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
											>
												{t("editUser")}
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Edit user modal */}
			{editingUser && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
					<div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl w-full max-w-md mx-4 p-6">
						<div className="flex items-center justify-between mb-6">
							<h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
								{t("editUser")}
							</h3>
							<button
								type="button"
								onClick={() => setEditingUser(null)}
								aria-label={t("cancel")}
								className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
							>
								<svg
									className="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>

						<div className="space-y-4">
							<div>
								<p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
									{t("userName")}
								</p>
								<p className="text-sm text-stone-900 dark:text-stone-100">
									{editingUser.name}
								</p>
							</div>
							<div>
								<p className="text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
									{t("userEmail")}
								</p>
								<p className="text-sm text-stone-500 dark:text-stone-400">
									{editingUser.email}
								</p>
							</div>

							{/* Role */}
							<div>
								<label
									htmlFor="edit-user-role"
									className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
								>
									{t("userRole")}
								</label>
								<select
									id="edit-user-role"
									value={editRole}
									onChange={(e) => setEditRole(e.target.value)}
									className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									{[
										"admin",
										"ceo",
										"executive",
										"hr",
										"manager",
										"employee",
									].map((r) => (
										<option key={r} value={r}>
											{t(`role_${r}` as Parameters<typeof t>[0])}
										</option>
									))}
								</select>
							</div>

							{/* Access Level */}
							<div>
								<label
									htmlFor="edit-user-access-level"
									className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
								>
									{t("userAccessLevel")}
								</label>
								<select
									id="edit-user-access-level"
									value={editAccessLevel}
									onChange={(e) => setEditAccessLevel(e.target.value)}
									className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									{["all", "department", "restricted"].map((l) => (
										<option key={l} value={l}>
											{l}
										</option>
									))}
								</select>
							</div>

							{/* Department */}
							<div>
								<label
									htmlFor="edit-user-department"
									className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
								>
									{t("userDept")}
								</label>
								<select
									id="edit-user-department"
									value={editDepartmentId ?? ""}
									onChange={(e) => setEditDepartmentId(e.target.value || null)}
									className="w-full px-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
								>
									<option value="">— None —</option>
									{departments.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="flex justify-end gap-3 mt-6">
							<button
								type="button"
								onClick={() => setEditingUser(null)}
								className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors"
							>
								{t("cancel")}
							</button>
							<button
								type="button"
								onClick={handleSaveUser}
								disabled={saving}
								className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
							>
								{saving ? "..." : t("saveUser")}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

function AccessBadge({ level }: { level: string }) {
	const colour =
		level === "all"
			? "text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-800"
			: level === "department"
				? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800"
				: "text-stone-600 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-700 dark:border-stone-600";
	return (
		<span
			className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${colour}`}
		>
			{level}
		</span>
	);
}

function RoleBadge({ role }: { role: string }) {
	const colour =
		role === "admin"
			? "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"
			: role === "ceo" || role === "executive"
				? "text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800"
				: role === "hr" || role === "manager"
					? "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-950/40 dark:border-blue-800"
					: "text-stone-600 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-700 dark:border-stone-600";
	return (
		<span
			className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${colour}`}
		>
			{role}
		</span>
	);
}

// ---- Health tab -----------------------------------------------------------

function HealthTab({ getAccessToken }: { getAccessToken: () => string }) {
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
				<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					{t("healthTitle")}
				</h2>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("healthSub")}
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			<div className="grid gap-4 sm:grid-cols-3">
				{loading
					? (["skel-pg", "skel-qdrant", "skel-redis"] as const).map((key) => (
							<div
								key={key}
								className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 animate-pulse"
							>
								<div className="flex items-center gap-3 mb-3">
									<div className="w-3 h-3 rounded-full bg-stone-200 dark:bg-stone-700" />
									<div className="h-4 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
								</div>
								<div className="h-3 w-16 bg-stone-100 dark:bg-stone-600 rounded" />
							</div>
						))
					: checks.map((check) => (
							<HealthCard key={check.service} check={check} />
						))}
			</div>
		</div>
	);
}

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
			className={`bg-white dark:bg-stone-800 rounded-xl border p-6 shadow-sm dark:shadow-none ${borderColour}`}
		>
			<div className="flex items-center gap-2.5 mb-3">
				<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColour}`} />
				<span className="text-sm font-semibold text-stone-900 dark:text-stone-100 capitalize">
					{check.service}
				</span>
			</div>
			<p className={`text-sm font-medium ${statusTextColour}`}>{statusLabel}</p>
			{check.latency_ms > 0 && (
				<p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
					{t("latency", { ms: check.latency_ms.toFixed(1) })}
				</p>
			)}
		</div>
	);
}

// ---- Safety tab -----------------------------------------------------------

function SafetyTab({ getAccessToken }: { getAccessToken: () => string }) {
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
			// silently ignore — the row stays unresolved
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
		return "text-stone-600 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-700 dark:border-stone-600";
	};

	const riskLabel = (level: string) => {
		if (level === "high") return t("riskHigh");
		if (level === "medium") return t("riskMedium");
		return t("riskLow");
	};

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
					{t("pageTitle")}
				</h2>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Stats cards */}
			<div className="grid gap-4 sm:grid-cols-4">
				{loading ? (
					(["s0", "s1", "s2", "s3"] as const).map((key) => (
						<div
							key={key}
							className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 animate-pulse"
						>
							<div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded mb-3" />
							<div className="h-7 w-12 bg-stone-100 dark:bg-stone-600 rounded" />
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
				<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none">
					<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-4">
						{t("topTypes")}
					</h3>
					<div className="space-y-3">
						{stats.top_violation_types.map(({ type, count }) => {
							const max = stats.top_violation_types[0]?.count ?? 1;
							const pct = Math.round((count / max) * 100);
							return (
								<div key={type}>
									<div className="flex items-center justify-between mb-1">
										<span className="text-xs font-medium text-stone-700 dark:text-stone-300 capitalize">
											{type.replace(/_/g, " ")}
										</span>
										<span className="text-xs text-stone-500 dark:text-stone-400">
											{count}
										</span>
									</div>
									<div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-700 overflow-hidden">
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
			<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm dark:shadow-none overflow-hidden">
				<div className="px-6 py-4 border-b border-stone-100 dark:border-stone-700">
					<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
						{t("violations")}
					</h3>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-stone-200 dark:divide-stone-700">
						<thead className="bg-stone-50 dark:bg-stone-900/50">
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
										className="px-4 py-3 text-left text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider"
									>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody className="divide-y divide-stone-100 dark:divide-stone-700/60">
							{loading ? (
								(["vr0", "vr1", "vr2", "vr3"] as const).map((rowKey) => (
									<tr key={rowKey} className="animate-pulse">
										{(["vc0", "vc1", "vc2", "vc3", "vc4", "vc5"] as const).map(
											(colKey) => (
												<td key={colKey} className="px-4 py-3">
													<div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-20" />
												</td>
											),
										)}
									</tr>
								))
							) : violations.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500"
									>
										—
									</td>
								</tr>
							) : (
								violations.map((v) => (
									<tr
										key={v.id}
										className="hover:bg-stone-50 dark:hover:bg-stone-700/40 transition-colors"
									>
										<td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap max-w-[160px] truncate">
											{v.user_email}
										</td>
										<td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300 capitalize whitespace-nowrap">
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
										<td className="px-4 py-3 text-xs text-stone-500 dark:text-stone-500 whitespace-nowrap">
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
													className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/50 dark:hover:border-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

function StatCard({ label, value }: { label: string; value: number }) {
	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 shadow-sm dark:shadow-none">
			<p className="text-xs font-medium text-stone-500 dark:text-stone-400 mb-1">
				{label}
			</p>
			<p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
				{value.toLocaleString()}
			</p>
		</div>
	);
}

// ---- Recipes tab ----------------------------------------------------------

function RecipesTab({ getAccessToken }: { getAccessToken: () => string }) {
	const t = useTranslations("recipes");
	const tAdmin = useTranslations("admin");
	const [recipes, setRecipes] = useState<AIRecipe[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [extracting, setExtracting] = useState(false);
	const [extractDone, setExtractDone] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/recipes?status=all`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const data: { recipes: AIRecipe[]; total: number } = await res.json();
				if (!cancelled) setRecipes(data.recipes);
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

	const handleExtract = async () => {
		setExtracting(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/recipes/extract`, {
				method: "POST",
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			setExtractDone(true);
			setTimeout(() => setExtractDone(false), 4000);
		} catch {
			// silently ignore
		} finally {
			setExtracting(false);
		}
	};

	const handleDelete = async (id: string) => {
		if (!window.confirm(tAdmin("confirmDelete") || "Delete this recipe?"))
			return;
		setDeletingId(id);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/recipes/${id}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			setRecipes((prev) => prev.filter((r) => r.id !== id));
		} catch {
			// silently ignore
		} finally {
			setDeletingId(null);
		}
	};

	const statusBadgeClass = (status: string) => {
		if (status === "published")
			return "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800";
		if (status === "draft")
			return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800";
		return "text-stone-500 bg-stone-50 border-stone-200 dark:text-stone-400 dark:bg-stone-700 dark:border-stone-600";
	};

	const statusLabel = (status: string) => {
		if (status === "published") return t("statusPublished");
		if (status === "draft") return t("statusDraft");
		return t("statusArchived");
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
						{t("pageTitle")}
					</h2>
					<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
						{t("subtitle")}
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{extractDone && (
						<span className="text-sm font-medium text-green-600 dark:text-green-400">
							{t("extractStarted")}
						</span>
					)}
					<button
						type="button"
						disabled={extracting}
						onClick={handleExtract}
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{extracting ? (
							<svg
								className="w-4 h-4 animate-spin"
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
						{t("extract")}
					</button>
				</div>
			</div>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Recipe cards grid */}
			{loading ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{(["rc0", "rc1", "rc2", "rc3"] as const).map((key) => (
						<div
							key={key}
							className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 animate-pulse"
						>
							<div className="h-4 w-40 bg-stone-200 dark:bg-stone-700 rounded mb-2" />
							<div className="h-3 w-full bg-stone-100 dark:bg-stone-600 rounded mb-1" />
							<div className="h-3 w-3/4 bg-stone-100 dark:bg-stone-600 rounded mb-4" />
							<div className="flex gap-2">
								<div className="h-5 w-16 bg-stone-200 dark:bg-stone-700 rounded-full" />
								<div className="h-5 w-16 bg-stone-200 dark:bg-stone-700 rounded-full" />
							</div>
						</div>
					))}
				</div>
			) : recipes.length === 0 ? (
				<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-12 text-center shadow-sm dark:shadow-none">
					<p className="text-sm font-medium text-stone-500 dark:text-stone-400">
						{t("noRecipes")}
					</p>
					<p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
						{t("noRecipesHint")}
					</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					{recipes.map((recipe) => (
						<div
							key={recipe.id}
							className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-6 shadow-sm dark:shadow-none flex flex-col gap-3"
						>
							{/* Title + status */}
							<div className="flex items-start justify-between gap-2">
								<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug">
									{recipe.title}
								</h3>
								<span
									className={`shrink-0 inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${statusBadgeClass(recipe.status)}`}
								>
									{statusLabel(recipe.status)}
								</span>
							</div>

							{/* Description */}
							{recipe.description && (
								<p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-2">
									{recipe.description}
								</p>
							)}

							{/* Meta row */}
							<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
								{recipe.department_name && (
									<span className="flex items-center gap-1">
										<svg
											className="w-3 h-3 shrink-0"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
											/>
										</svg>
										{recipe.department_name}
									</span>
								)}
								<span className="flex items-center gap-1">
									<svg
										className="w-3 h-3 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
										/>
									</svg>
									{t("effectiveness")}:{" "}
									{Math.round(recipe.effectiveness_score * 100)}%
								</span>
								<span className="flex items-center gap-1">
									<svg
										className="w-3 h-3 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									{t("usageCount")}: {recipe.usage_count}
								</span>
							</div>

							{/* Delete button */}
							<div className="pt-1 flex justify-end">
								<button
									type="button"
									disabled={deletingId === recipe.id}
									onClick={() => handleDelete(recipe.id)}
									className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/50 dark:hover:border-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{deletingId === recipe.id ? (
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
									) : (
										<svg
											className="w-3 h-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
											/>
										</svg>
									)}
									Delete
								</button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ---- Data Sources tab (existing content wrapped) -------------------------

function DataSourcesTab({
	sources,
	sourcesLoading,
	sourcesError,
	ingestStates,
	onIngest,
	locale,
}: {
	sources: KnowledgeSource[];
	sourcesLoading: boolean;
	sourcesError: string | null;
	ingestStates: Record<string, IngestState>;
	onIngest: (id: string) => void;
	locale: string;
}) {
	const t = useTranslations("admin");

	return (
		<div className="space-y-8">
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
								onIngest={onIngest}
								ingestState={ingestStates[source.id] ?? "idle"}
							/>
						))
					)}
				</div>
			</section>

			{/* Usage Analytics section */}
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
					<AnalyticsLinkCard
						title={t("queryAnalytics")}
						description={t("queryAnalyticsSub")}
						href={`/${locale}/analytics`}
						linkLabel={t("viewAnalytics")}
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
					<AnalyticsLinkCard
						title={t("userActivity")}
						description={t("userActivitySub")}
						href={`/${locale}/analytics`}
						linkLabel={t("viewAnalytics")}
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
	);
}

// ---- Knowledge Tab -------------------------------------------------------

function KnowledgeTab({ getAccessToken }: { getAccessToken: () => string }) {
	const t = useTranslations("admin");
	const [items, setItems] = useState<PromotableQA[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [promoting, setPromoting] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const pageSize = 20;

	const fetchItems = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/knowledge/promotable?page=${page}&page_size=${pageSize}`,
				{ headers: { Authorization: `Bearer ${getAccessToken()}` } },
			);
			if (res.ok) {
				const data = await res.json();
				setItems(data.items);
				setTotal(data.total);
			}
		} finally {
			setLoading(false);
		}
	}, [getAccessToken, page]);

	useEffect(() => {
		fetchItems();
	}, [fetchItems]);

	const handlePromote = async (item: PromotableQA) => {
		setPromoting(item.message_id);
		setSuccess(null);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/knowledge/promote`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						message_id: item.message_id,
						title: `Q&A: ${item.question.slice(0, 80)}`,
						category: "general",
						access_level: "all",
					}),
				},
			);
			if (res.ok) {
				setSuccess(item.message_id);
				await fetchItems();
			}
		} finally {
			setPromoting(null);
		}
	};

	const totalPages = Math.ceil(total / pageSize);

	return (
		<div>
			<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
				{t("knowledgeTitle")}
			</h2>
			<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5 mb-4">
				{t("knowledgeSub")}
			</p>

			{loading ? (
				<div className="flex items-center justify-center py-12">
					<div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
				</div>
			) : items.length === 0 ? (
				<p className="text-sm text-stone-500 dark:text-stone-400 text-center py-12">
					{t("knowledgeEmpty")}
				</p>
			) : (
				<>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-stone-200 dark:border-stone-700 text-left text-stone-500 dark:text-stone-400">
									<th className="pb-2 font-medium">{t("knowledgeQuestion")}</th>
									<th className="pb-2 font-medium">{t("knowledgeAnswer")}</th>
									<th className="pb-2 font-medium text-center">
										{t("knowledgeUpvotes")}
									</th>
									<th className="pb-2 font-medium text-center">
										{t("actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{items.map((item) => (
									<tr
										key={item.message_id}
										className="border-b border-stone-100 dark:border-stone-800"
									>
										<td className="py-3 pr-3 max-w-[240px]">
											<p className="text-stone-900 dark:text-stone-100 truncate">
												{item.question}
											</p>
											<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
												{item.user_email}
											</p>
										</td>
										<td className="py-3 pr-3 max-w-[300px]">
											<p className="text-stone-700 dark:text-stone-300 line-clamp-2 text-xs">
												{item.answer}
											</p>
										</td>
										<td className="py-3 text-center">
											<span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
												<svg
													className="w-4 h-4"
													fill="currentColor"
													viewBox="0 0 20 20"
													aria-hidden="true"
												>
													<path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
												</svg>
												{item.upvote_count}
											</span>
										</td>
										<td className="py-3 text-center">
											{item.already_promoted ? (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
													{t("knowledgePromoted")}
												</span>
											) : (
												<button
													type="button"
													onClick={() => handlePromote(item)}
													disabled={promoting === item.message_id}
													className="px-3 py-1 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
												>
													{promoting === item.message_id
														? "..."
														: t("knowledgePromote")}
												</button>
											)}
											{success === item.message_id && (
												<p className="text-xs text-green-600 dark:text-green-400 mt-1">
													{t("knowledgePromoteSuccess")}
												</p>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{totalPages > 1 && (
						<div className="flex justify-center gap-2 mt-4">
							<button
								type="button"
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page === 1}
								className="px-3 py-1 text-sm rounded border border-stone-300 dark:border-stone-600 disabled:opacity-40"
							>
								&laquo;
							</button>
							<span className="px-3 py-1 text-sm text-stone-600 dark:text-stone-400">
								{page} / {totalPages}
							</span>
							<button
								type="button"
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								disabled={page === totalPages}
								className="px-3 py-1 text-sm rounded border border-stone-300 dark:border-stone-600 disabled:opacity-40"
							>
								&raquo;
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}

// ---- Page ----------------------------------------------------------------

export default function AdminPage() {
	const t = useTranslations("admin");
	const locale = useLocale();
	const { data: session } = useSession();

	const [activeTab, setActiveTab] = useState<TabId>("datasources");
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
					headers: { Authorization: `Bearer ${getAccessToken()}` },
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
	}, [getAccessToken, t]);

	// Trigger ingestion for a connector
	const handleIngest = useCallback(
		async (sourceId: string) => {
			setIngestStates((prev) => ({ ...prev, [sourceId]: "loading" }));
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/knowledge/ingest?connector_type=${encodeURIComponent(sourceId)}`,
					{
						method: "POST",
						headers: { Authorization: `Bearer ${getAccessToken()}` },
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
		[getAccessToken],
	);

	const tabs: { id: TabId; label: string }[] = [
		{ id: "datasources", label: t("tabDataSources") },
		{ id: "settings", label: t("tabSettings") },
		{ id: "users", label: t("tabUsers") },
		{ id: "health", label: t("tabHealth") },
		{ id: "safety", label: t("tabSafety") },
		{ id: "recipes", label: t("tabRecipes") },
		{ id: "knowledge", label: t("tabKnowledge") },
	];

	// Role guard - only admin users can access this page
	if (session?.user?.role && session.user.role !== "admin") {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
						{t("accessDenied")}
					</h2>
					<p className="text-stone-500 dark:text-stone-400 mt-2">
						{t("accessDeniedDesc")}
					</p>
				</div>
			</div>
		);
	}

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

			{/* Tab bar */}
			<div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900/80 px-6 shrink-0">
				<nav className="-mb-px flex gap-1" aria-label="Admin tabs">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
								activeTab === tab.id
									? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
									: "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-500"
							}`}
						>
							{tab.label}
						</button>
					))}
				</nav>
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto">
					{activeTab === "datasources" && (
						<DataSourcesTab
							sources={sources}
							sourcesLoading={sourcesLoading}
							sourcesError={sourcesError}
							ingestStates={ingestStates}
							onIngest={handleIngest}
							locale={locale}
						/>
					)}
					{activeTab === "settings" && (
						<SettingsTab getAccessToken={getAccessToken} />
					)}
					{activeTab === "users" && (
						<UsersTab getAccessToken={getAccessToken} />
					)}
					{activeTab === "health" && (
						<HealthTab getAccessToken={getAccessToken} />
					)}
					{activeTab === "safety" && (
						<SafetyTab getAccessToken={getAccessToken} />
					)}
					{activeTab === "recipes" && (
						<RecipesTab getAccessToken={getAccessToken} />
					)}
					{activeTab === "knowledge" && (
						<KnowledgeTab getAccessToken={getAccessToken} />
					)}
				</div>
			</div>
		</div>
	);
}
