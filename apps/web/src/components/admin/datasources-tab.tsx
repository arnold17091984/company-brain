"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

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

interface APIKeyStatus {
	key_name: string;
	source: "db" | "env" | "none";
	masked_value: string | null;
}

// ---- Props ----------------------------------------------------------------

interface DataSourcesTabProps {
	sources: KnowledgeSource[];
	sourcesLoading: boolean;
	sourcesError: string | null;
	ingestStates: Record<string, IngestState>;
	onIngest: (id: string) => void;
	locale: string;
	getAccessToken: () => string;
}

// ---- ConnectorIcon --------------------------------------------------------

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

// ---- SkeletonCard ---------------------------------------------------------

function SkeletonCard() {
	return (
		<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5 animate-pulse">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-zinc-200 dark:bg-white/[0.06]" />
				<div className="flex-1 min-w-0 space-y-2">
					<div className="h-4 w-32 bg-zinc-200 dark:bg-white/[0.06] rounded" />
					<div className="h-3 w-48 bg-zinc-100 dark:bg-white/[0.04] rounded" />
					<div className="h-3 w-24 bg-zinc-100 dark:bg-white/[0.04] rounded" />
				</div>
			</div>
		</div>
	);
}

// ---- GoogleDriveFolderConfig ----------------------------------------------

function GoogleDriveFolderConfig({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [expanded, setExpanded] = useState(false);
	const [folderIds, setFolderIds] = useState<string[]>([]);
	const [newFolderId, setNewFolderId] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (!expanded) return;
		let cancelled = false;
		async function loadConfig() {
			setLoading(true);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/admin/connectors/google_drive/config`,
					{ headers: { Authorization: `Bearer ${getAccessToken()}` } },
				);
				if (res.ok) {
					const data = await res.json();
					if (!cancelled) setFolderIds(data.config?.folder_ids ?? []);
				}
			} catch {
				/* ignore */
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		loadConfig();
		return () => {
			cancelled = true;
		};
	}, [expanded, getAccessToken]);

	const handleSave = async () => {
		setSaving(true);
		setSaved(false);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/connectors/google_drive/config`,
				{
					method: "PUT",
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ folder_ids: folderIds }),
				},
			);
			if (res.ok) setSaved(true);
		} catch {
			/* ignore */
		} finally {
			setSaving(false);
			setTimeout(() => setSaved(false), 3000);
		}
	};

	const handleAdd = () => {
		const trimmed = newFolderId.trim();
		if (trimmed && !folderIds.includes(trimmed)) {
			setFolderIds((prev) => [...prev, trimmed]);
			setNewFolderId("");
		}
	};

	const handleRemove = (id: string) => {
		setFolderIds((prev) => prev.filter((f) => f !== id));
	};

	return (
		<div className="mt-3 border-t border-zinc-200/60 dark:border-white/[0.04] pt-3">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="min-h-[44px] flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
			>
				<svg
					className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
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
				{t("folderScope")}
			</button>

			{expanded && (
				<div className="mt-2 space-y-2">
					{loading ? (
						<div className="h-8 w-full bg-zinc-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
					) : (
						<>
							{folderIds.length === 0 && (
								<p className="text-xs text-zinc-400 dark:text-zinc-500">
									{t("noFolders")}
								</p>
							)}
							{folderIds.map((fid) => (
								<div
									key={fid}
									className="flex items-center gap-2 bg-zinc-50 dark:bg-white/[0.03] rounded-lg px-3 py-1.5"
								>
									<svg
										className="w-3.5 h-3.5 text-zinc-400 shrink-0"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
										/>
									</svg>
									<span className="text-xs text-zinc-600 dark:text-zinc-300 truncate flex-1 font-mono">
										{fid}
									</span>
									<button
										type="button"
										onClick={() => handleRemove(fid)}
										className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/[0.08] transition-colors"
										aria-label="Remove"
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
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</div>
							))}

							<div className="flex items-center gap-2">
								<input
									type="text"
									value={newFolderId}
									onChange={(e) => setNewFolderId(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleAdd();
									}}
									placeholder={t("folderIdPlaceholder")}
									className="min-h-[44px] flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/40 transition-colors font-mono"
								/>
								<button
									type="button"
									onClick={handleAdd}
									disabled={!newFolderId.trim()}
									className="min-h-[44px] px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/[0.08] rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.15] transition-colors disabled:opacity-40"
								>
									{t("addFolder")}
								</button>
							</div>

							<div className="flex items-center gap-2 pt-1">
								<button
									type="button"
									onClick={handleSave}
									disabled={saving}
									className="min-h-[44px] px-3 py-2 text-xs font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter] duration-150 disabled:opacity-50 shadow-sm shadow-indigo-500/25"
								>
									{saving ? "..." : t("saveConfig")}
								</button>
								{saved && (
									<span className="text-xs text-green-600 dark:text-green-400 font-medium">
										{t("configSaved")}
									</span>
								)}
							</div>

							<p className="text-[11px] text-zinc-400 dark:text-zinc-500">
								{t("folderScopeSub")}
							</p>
						</>
					)}
				</div>
			)}
		</div>
	);
}

// ---- ConnectorCredentialConfig -------------------------------------------

const CONNECTOR_KEY_MAP: Record<string, string> = {
	telegram: "telegram_bot_token",
	notion: "notion_integration_token",
};

function ConnectorCredentialConfig({
	connectorId,
	getAccessToken,
}: {
	connectorId: string;
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const keyName = CONNECTOR_KEY_MAP[connectorId];
	const [expanded, setExpanded] = useState(false);
	const [status, setStatus] = useState<APIKeyStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [editing, setEditing] = useState(false);
	const [tokenValue, setTokenValue] = useState("");
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		if (!expanded) return;
		let cancelled = false;
		async function loadStatus() {
			setLoading(true);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/admin/api-keys`, {
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				});
				if (res.ok) {
					const keys: APIKeyStatus[] = await res.json();
					const found = keys.find((k) => k.key_name === keyName);
					if (!cancelled && found) setStatus(found);
				}
			} catch {
				/* non-critical */
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		loadStatus();
		return () => {
			cancelled = true;
		};
	}, [expanded, getAccessToken, keyName]);

	const handleSave = async () => {
		if (!tokenValue.trim()) return;
		setSaving(true);
		setSaved(false);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/admin/api-keys`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ [keyName]: tokenValue }),
			});
			if (res.ok) {
				const keys: APIKeyStatus[] = await res.json();
				const found = keys.find((k) => k.key_name === keyName);
				if (found) setStatus(found);
				setEditing(false);
				setTokenValue("");
				setSaved(true);
				setTimeout(() => setSaved(false), 3000);
			}
		} catch {
			/* non-critical */
		} finally {
			setSaving(false);
		}
	};

	const handleReset = async () => {
		setSaving(true);
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
				const keys: APIKeyStatus[] = await res.json();
				const found = keys.find((k) => k.key_name === keyName);
				if (found) setStatus(found);
			}
		} catch {
			/* non-critical */
		} finally {
			setSaving(false);
		}
	};

	if (!keyName) return null;

	const sourceBadge = status
		? {
				db: {
					label: "DB",
					cls: "text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-500/[0.12]",
				},
				env: {
					label: "Env",
					cls: "text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/[0.12]",
				},
				none: {
					label: t("credentialNotSet"),
					cls: "text-zinc-500 bg-zinc-100 dark:text-zinc-400 dark:bg-white/[0.06]",
				},
			}[status.source]
		: null;

	return (
		<div className="mt-3 border-t border-zinc-200/60 dark:border-white/[0.04] pt-3">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="min-h-[44px] flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
			>
				<svg
					className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
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
				{t("connectionSettings")}
			</button>

			{expanded && (
				<div className="mt-2 space-y-2">
					{loading ? (
						<div className="h-8 w-full bg-zinc-100 dark:bg-white/[0.04] rounded-lg animate-pulse" />
					) : (
						<>
							<div className="flex items-center gap-2 bg-zinc-50 dark:bg-white/[0.03] rounded-lg px-3 py-2">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
											{connectorId === "telegram"
												? "Bot Token"
												: "Integration Token"}
										</span>
										{sourceBadge && (
											<span
												className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.cls}`}
											>
												{sourceBadge.label}
											</span>
										)}
									</div>
									{status?.masked_value && (
										<p className="text-xs text-zinc-400 dark:text-zinc-500 font-mono mt-0.5 truncate">
											{status.masked_value}
										</p>
									)}
									{status?.source === "none" && (
										<p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
											{t("credentialNotSet")}
										</p>
									)}
								</div>

								{!editing && (
									<div className="flex items-center gap-1 shrink-0">
										<button
											type="button"
											onClick={() => setEditing(true)}
											className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/[0.08] rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.15] transition-colors"
										>
											{t("changeCredential")}
										</button>
										{status?.source === "db" && (
											<button
												type="button"
												onClick={handleReset}
												disabled={saving}
												className="min-h-[32px] px-2.5 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.04] rounded-lg hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-colors disabled:opacity-50"
											>
												{t("resetCredential")}
											</button>
										)}
									</div>
								)}
							</div>

							{editing && (
								<div className="flex items-center gap-2">
									<input
										type="password"
										value={tokenValue}
										onChange={(e) => setTokenValue(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSave();
										}}
										placeholder={t("enterToken")}
										className="min-h-[44px] flex-1 px-3 py-2 text-xs rounded-xl border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400/40 transition-colors font-mono"
									/>
									<button
										type="button"
										onClick={handleSave}
										disabled={saving || !tokenValue.trim()}
										className="min-h-[44px] px-3 py-2 text-xs font-medium text-white bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl hover:brightness-110 transition-[filter] duration-150 disabled:opacity-50 shadow-sm shadow-indigo-500/25"
									>
										{saving ? "..." : t("saveConfig")}
									</button>
									<button
										type="button"
										onClick={() => {
											setEditing(false);
											setTokenValue("");
										}}
										className="min-h-[44px] px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-white/[0.04] rounded-xl hover:bg-zinc-200 dark:hover:bg-white/[0.08] transition-colors"
									>
										{t("cancel")}
									</button>
								</div>
							)}

							{saved && (
								<span className="text-xs text-green-600 dark:text-green-400 font-medium">
									{t("tokenSaved")}
								</span>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}

// ---- ConnectorCard --------------------------------------------------------

function ConnectorCard({
	source,
	onIngest,
	ingestState,
	getAccessToken,
}: {
	source: KnowledgeSource;
	onIngest: (id: string) => void;
	ingestState: IngestState;
	getAccessToken: () => string;
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
		<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
					<ConnectorIcon id={source.id} />
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<h3 className="font-medium text-zinc-900 dark:text-zinc-100">
							{source.label}
						</h3>
						<span
							className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 border ${
								isActive
									? "text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-800"
									: "text-zinc-500 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-[#1e1e24] dark:border-white/[0.06]"
							}`}
						>
							<span
								className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-zinc-400"}`}
							/>
							{isActive ? t("statusActive") : t("statusInactive")}
						</span>
					</div>

					<p className="text-sm text-zinc-500 dark:text-zinc-400">
						{t("documents", { count: source.document_count })}
					</p>

					<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
						{lastSyncedText}
					</p>

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

					<button
						type="button"
						disabled={ingestState === "loading"}
						onClick={() => onIngest(source.id)}
						className="mt-3 min-h-[44px] inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border transition-colors duration-150 bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 dark:bg-indigo-500/[0.08] dark:border-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/[0.15] dark:hover:border-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
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

					{source.id === "google_drive" && (
						<GoogleDriveFolderConfig getAccessToken={getAccessToken} />
					)}
					{(source.id === "telegram" || source.id === "notion") && (
						<ConnectorCredentialConfig
							connectorId={source.id}
							getAccessToken={getAccessToken}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

// ---- AnalyticsLinkCard ----------------------------------------------------

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
		<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
			<div className="flex items-start gap-4">
				<div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600">
					{icon}
				</div>
				<div className="flex-1 min-w-0">
					<h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
						{title}
					</h3>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
						{description}
					</p>
					<Link
						href={href}
						className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1 hover:bg-indigo-100 transition-colors dark:text-indigo-300 dark:bg-indigo-500/[0.08] dark:border-indigo-500/20 dark:hover:bg-indigo-500/[0.15]"
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

// ---- DataSourcesTab -------------------------------------------------------

export function DataSourcesTab({
	sources,
	sourcesLoading,
	sourcesError,
	ingestStates,
	onIngest,
	locale,
	getAccessToken,
}: DataSourcesTabProps) {
	const t = useTranslations("admin");

	return (
		<div className="space-y-8">
			{/* Data Sources section */}
			<section>
				<div className="flex items-center justify-between mb-4">
					<div>
						<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
							{t("dataSources")}
						</h2>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
							{t("dataSourcesSub")}
						</p>
					</div>
				</div>

				{sourcesError && (
					<div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
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
								getAccessToken={getAccessToken}
							/>
						))
					)}
				</div>
			</section>

			{/* Usage Analytics section */}
			<section>
				<div className="mb-4">
					<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
						{t("usageAnalytics")}
					</h2>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
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
