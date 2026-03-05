"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

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

interface APIKeyStatus {
	key_name: string;
	source: "db" | "env" | "none";
	masked_value: string | null;
}

// ---- SettingsField --------------------------------------------------------

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
	const inputId = `sf-${label.toLowerCase().replace(/\s+/g, "-")}`;
	return (
		<div>
			<label
				htmlFor={inputId}
				className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5"
			>
				{label}
			</label>
			<input
				id={inputId}
				type={type}
				value={value}
				step={step}
				onChange={(e) => onChange(e.target.value)}
				className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/40 transition-colors"
			/>
		</div>
	);
}

// ---- SettingsTab ----------------------------------------------------------

export function SettingsTab({
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
	const [apiKeys, setApiKeys] = useState<APIKeyStatus[]>([]);
	const [apiKeysLoading, setApiKeysLoading] = useState(true);
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [keyValue, setKeyValue] = useState("");
	const [keySaving, setKeySaving] = useState(false);

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

	useEffect(() => {
		async function loadKeys() {
			setApiKeysLoading(true);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/api-keys`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (res.ok) {
					setApiKeys(await res.json());
				}
			} catch {
				setError(t("loadError"));
			} finally {
				setApiKeysLoading(false);
			}
		}
		loadKeys();
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

	const handleSaveKey = async (keyName: string) => {
		setKeySaving(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/api-keys`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ [keyName]: keyValue }),
			});
			if (res.ok) {
				setApiKeys(await res.json());
				setEditingKey(null);
				setKeyValue("");
			}
		} catch {
			setError(t("loadError"));
		} finally {
			setKeySaving(false);
		}
	};

	const handleResetKey = async (keyName: string) => {
		setKeySaving(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/api-keys`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ [keyName]: "" }),
			});
			if (res.ok) {
				setApiKeys(await res.json());
			}
		} catch {
			setError(t("loadError"));
		} finally {
			setKeySaving(false);
		}
	};

	if (loading) {
		return (
			<div className="space-y-4">
				{[1, 2, 3].map((i) => (
					<div
						key={i}
						className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5 animate-pulse"
					>
						<div className="h-4 w-32 bg-zinc-200 dark:bg-white/[0.06] rounded mb-4" />
						<div className="space-y-3">
							<div className="h-8 bg-zinc-100 dark:bg-white/[0.04] rounded" />
							<div className="h-8 bg-zinc-100 dark:bg-white/[0.04] rounded" />
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
				<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
					{t("settingsTitle")}
				</h2>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("settingsSub")}
				</p>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* RAG section */}
			<section className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
				<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
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
			<section className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
				<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
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
			<section className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
				<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-4">
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
					className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-medium hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/25"
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

			{/* API Keys */}
			<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5 overflow-hidden">
				<h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-1">
					{t("apiKeysTitle")}
				</h3>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
					{t("apiKeysSub")}
				</p>
				{apiKeysLoading ? (
					<p className="text-sm text-zinc-500">Loading...</p>
				) : (
					<div className="space-y-3">
						{apiKeys.map((ak) => (
							<div
								key={ak.key_name}
								className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-white/[0.03]"
							>
								<div className="min-w-0 flex-1 overflow-hidden">
									<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
										{ak.key_name
											.replace(/_/g, " ")
											.replace(/\b\w/g, (c) => c.toUpperCase())
											.replace("Api", "API")
											.replace("Ai", "AI")}
									</p>
									<div className="flex items-center gap-2 mt-0.5 min-w-0 overflow-hidden">
										<span
											className={`shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
												ak.source === "db"
													? "text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40"
													: ak.source === "env"
														? "text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/40"
														: "text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-white/[0.06]"
											}`}
										>
											{t(
												ak.source === "db"
													? "apiKeySourceDb"
													: ak.source === "env"
														? "apiKeySourceEnv"
														: "apiKeySourceNone",
											)}
										</span>
										{ak.masked_value && (
											<span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate min-w-0">
												{ak.masked_value}
											</span>
										)}
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2 shrink-0">
									{editingKey === ak.key_name ? (
										<>
											<input
												type="password"
												value={keyValue}
												onChange={(e) => setKeyValue(e.target.value)}
												placeholder="Enter new key..."
												className="min-h-[44px] px-3 py-2 text-sm rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/40 w-full sm:w-48 transition-colors"
											/>
											<button
												type="button"
												onClick={() => handleSaveKey(ak.key_name)}
												disabled={keySaving || !keyValue}
												className="min-h-[44px] px-3 py-2 text-xs font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter] duration-150 disabled:opacity-50 shadow-sm shadow-indigo-500/25"
											>
												{t("saveSettings")}
											</button>
											<button
												type="button"
												onClick={() => {
													setEditingKey(null);
													setKeyValue("");
												}}
												className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors duration-150"
											>
												{t("cancel")}
											</button>
										</>
									) : (
										<>
											<button
												type="button"
												onClick={() => {
													setEditingKey(ak.key_name);
													setKeyValue("");
												}}
												className="min-h-[44px] px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/[0.15] rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.22] transition-colors duration-150"
											>
												{t("apiKeyUpdate")}
											</button>
											{ak.source === "db" && (
												<button
													type="button"
													onClick={() => handleResetKey(ak.key_name)}
													disabled={keySaving}
													className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-white/[0.06] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.1] transition-colors duration-150 disabled:opacity-50"
												>
													{t("apiKeyResetEnv")}
												</button>
											)}
										</>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
