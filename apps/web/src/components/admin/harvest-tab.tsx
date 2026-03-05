"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface UserSummary {
	id: string;
	email: string;
	name: string;
	department: string | null;
	department_id: string | null;
	access_level: string;
	role: string;
	telegram_id: number | null;
	created_at: string;
}

interface HarvestSession {
	id: string;
	target_user_name: string;
	target_user_email: string;
	status: "active" | "completed" | "paused";
	total_questions: number;
	answered_questions: number;
	progress_percent: number;
	created_at: string;
	suspension_date: string | null;
}

interface HarvestQuestion {
	id: string;
	category: string;
	question: string;
	answer: string | null;
	answer_quality: number | null;
	source: string | null;
	asked_at: string;
	answered_at: string | null;
}

interface HarvestSessionDetail extends HarvestSession {
	questions: HarvestQuestion[];
}

// ---- HarvestTab -----------------------------------------------------------

export function HarvestTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("harvest");
	const tAdmin = useTranslations("admin");

	const [sessions, setSessions] = useState<HarvestSession[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Detail view
	const [selectedSession, setSelectedSession] =
		useState<HarvestSessionDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [categoryFilter, setCategoryFilter] = useState<string>("all");

	// Create session modal
	const [showCreate, setShowCreate] = useState(false);
	const [users, setUsers] = useState<UserSummary[]>([]);
	const [usersLoading, setUsersLoading] = useState(false);
	const [formUserId, setFormUserId] = useState("");
	const [formDate, setFormDate] = useState("");
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	// Pause/Resume
	const [togglingId, setTogglingId] = useState<string | null>(null);

	const fetchSessions = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/harvest/sessions`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data: HarvestSession[] = await res.json();
			setSessions(data);
		} catch {
			setError(tAdmin("loadError"));
		} finally {
			setLoading(false);
		}
	}, [getAccessToken, tAdmin]);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	const fetchDetail = async (id: string) => {
		setDetailLoading(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/harvest/sessions/${id}`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data: HarvestSessionDetail = await res.json();
			setSelectedSession(data);
			setCategoryFilter("all");
		} catch {
			// silently keep list view on error
		} finally {
			setDetailLoading(false);
		}
	};

	const fetchUsers = async () => {
		setUsersLoading(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
				headers: { Authorization: `Bearer ${getAccessToken()}` },
			});
			if (res.ok) {
				const data: UserSummary[] = await res.json();
				setUsers(data);
			}
		} finally {
			setUsersLoading(false);
		}
	};

	const openCreate = () => {
		setShowCreate(true);
		setFormUserId("");
		setFormDate("");
		setCreateError(null);
		fetchUsers();
	};

	const handleCreate = async () => {
		if (!formUserId) {
			setCreateError(t("selectUser"));
			return;
		}
		setCreating(true);
		setCreateError(null);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/harvest/sessions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${getAccessToken()}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					target_user_id: formUserId,
					suspension_date: formDate || null,
				}),
			});
			if (!res.ok) throw new Error(`${res.status}`);
			setShowCreate(false);
			fetchSessions();
		} catch {
			setCreateError(tAdmin("loadError"));
		} finally {
			setCreating(false);
		}
	};

	const handleToggle = async (session: HarvestSession) => {
		setTogglingId(session.id);
		const action = session.status === "paused" ? "resume" : "pause";
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/harvest/sessions/${session.id}/${action}`,
				{
					method: "PATCH",
					headers: { Authorization: `Bearer ${getAccessToken()}` },
				},
			);
			if (!res.ok) throw new Error(`${res.status}`);
			setSessions((prev) =>
				prev.map((s) =>
					s.id === session.id
						? { ...s, status: action === "pause" ? "paused" : "active" }
						: s,
				),
			);
			if (selectedSession?.id === session.id) {
				setSelectedSession((prev) =>
					prev
						? {
								...prev,
								status: action === "pause" ? "paused" : "active",
							}
						: null,
				);
			}
		} catch {
			// silently ignore
		} finally {
			setTogglingId(null);
		}
	};

	const statusBadgeClass = (status: string) => {
		if (status === "active" || status === "completed")
			return "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-950/40 dark:border-green-800";
		return "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800";
	};

	const categoryLabel = (cat: string) => {
		if (cat === "project") return t("categories.project");
		if (cat === "process") return t("categories.process");
		if (cat === "client") return t("categories.client");
		if (cat === "tool") return t("categories.tool");
		if (cat === "team") return t("categories.team");
		return cat;
	};

	const statusLabel = (status: string) => {
		if (status === "active") return t("status.active");
		if (status === "completed") return t("status.completed");
		return t("status.paused");
	};

	// Detail view
	if (selectedSession) {
		const categories = [
			"all",
			...Array.from(new Set(selectedSession.questions.map((q) => q.category))),
		];
		const filtered =
			categoryFilter === "all"
				? selectedSession.questions
				: selectedSession.questions.filter(
						(q) => q.category === categoryFilter,
					);

		return (
			<div className="space-y-6 animate-fade-in">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<button
							type="button"
							onClick={() => setSelectedSession(null)}
							className="min-h-[44px] text-sm text-indigo-600 dark:text-indigo-400 hover:underline mb-1 flex items-center gap-1 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
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
									d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
								/>
							</svg>
							{t("backToList")}
						</button>
						<h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
							{selectedSession.target_user_name}
						</h2>
						<p className="text-sm text-zinc-500 dark:text-zinc-400">
							{selectedSession.target_user_email}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<span
							className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(selectedSession.status)}`}
						>
							{statusLabel(selectedSession.status)}
						</span>
						{selectedSession.status !== "completed" && (
							<button
								type="button"
								onClick={() => handleToggle(selectedSession)}
								disabled={togglingId === selectedSession.id}
								className="min-h-[44px] px-3 py-1.5 text-sm font-medium rounded-xl border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
							>
								{selectedSession.status === "paused"
									? t("resumeSession")
									: t("pauseSession")}
							</button>
						)}
					</div>
				</div>

				{/* Progress card */}
				<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
					<div className="flex items-center justify-between mb-2">
						<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
							{t("progress")}
						</span>
						<span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
							{selectedSession.answered_questions} /{" "}
							{selectedSession.total_questions}
						</span>
					</div>
					<div className="h-2 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
						<div
							className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all"
							style={{ width: `${selectedSession.progress_percent}%` }}
						/>
					</div>
					<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
						{Math.round(selectedSession.progress_percent)}%
					</p>
				</div>

				{/* Category filters */}
				<div className="flex flex-wrap gap-2">
					{categories.map((cat) => (
						<button
							key={cat}
							type="button"
							onClick={() => setCategoryFilter(cat)}
							className={`min-h-[44px] px-3 py-1 text-sm rounded-full border transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none ${
								categoryFilter === cat
									? "bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500"
									: "border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-white/[0.15]"
							}`}
						>
							{cat === "all" ? t("allCategories") : categoryLabel(cat)}
						</button>
					))}
				</div>

				{/* Questions list */}
				<div className="space-y-4">
					{filtered.map((q, _qIdx) => (
						<div
							key={q.id}
							className="animate-fade-in opacity-0"
							style={{
								animationDelay: `${_qIdx * 50}ms`,
								animationFillMode: "forwards",
							}}
						>
							<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
								<div className="flex items-start justify-between gap-3 mb-3">
									<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 border border-zinc-200/80 dark:border-white/[0.06]">
										{categoryLabel(q.category)}
									</span>
									{q.answered_at ? (
										<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
											{q.source
												? t("answerVia", { source: q.source })
												: t("answered")}
										</span>
									) : (
										<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-white/[0.06] text-zinc-500 dark:text-zinc-400 border border-zinc-200/80 dark:border-white/[0.06]">
											{t("noAnswer")}
										</span>
									)}
								</div>
								<p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
									{q.question}
								</p>
								{q.answer && (
									<p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
										{q.answer}
									</p>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	// List view
	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
						{t("title")}
					</h2>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
						{t("description")}
					</p>
				</div>
				<button
					type="button"
					onClick={openCreate}
					className="min-h-[44px] bg-gradient-to-br from-indigo-500 to-violet-600 hover:brightness-110 text-white rounded-xl shadow-md shadow-indigo-500/25 px-4 py-2 text-sm font-medium transition-[filter,transform] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none flex items-center gap-2"
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
							d="M12 4.5v15m7.5-7.5h-15"
						/>
					</svg>
					{t("flagUser")}
				</button>
			</div>

			{error && (
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Create session modal */}
			{showCreate && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
					<div className="bg-white dark:bg-[#1e1e24] rounded-2xl border border-zinc-200/80 dark:border-white/[0.08] p-6 shadow-2xl dark:shadow-black/60 w-full max-w-md mx-4">
						<h3 className="text-base font-medium text-zinc-900 dark:text-zinc-100 mb-4">
							{t("createSession")}
						</h3>

						{createError && (
							<div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-400">
								{createError}
							</div>
						)}

						<div className="space-y-4">
							<div>
								<label
									htmlFor="harvest-user"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("selectUser")}
								</label>
								{usersLoading ? (
									<Skeleton height="2.25rem" className="rounded-lg" />
								) : (
									<select
										id="harvest-user"
										value={formUserId}
										onChange={(e) => setFormUserId(e.target.value)}
										className="w-full rounded-md border border-zinc-300 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
									>
										<option value="">— {t("selectUser")} —</option>
										{users.map((u) => (
											<option key={u.id} value={u.id}>
												{u.name} ({u.email})
											</option>
										))}
									</select>
								)}
							</div>

							<div>
								<label
									htmlFor="harvest-date"
									className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1"
								>
									{t("suspensionDate")}
								</label>
								<input
									id="harvest-date"
									type="date"
									value={formDate}
									onChange={(e) => setFormDate(e.target.value)}
									className="w-full rounded-md border border-zinc-300 dark:border-white/[0.08] bg-white dark:bg-[#1e1e24] text-zinc-900 dark:text-zinc-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
								/>
							</div>
						</div>

						<div className="flex justify-end gap-3 mt-6">
							<button
								type="button"
								onClick={() => setShowCreate(false)}
								className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
							>
								{tAdmin("cancel")}
							</button>
							<button
								type="button"
								onClick={handleCreate}
								disabled={creating}
								className="min-h-[44px] bg-gradient-to-br from-indigo-500 to-violet-600 hover:brightness-110 text-white rounded-xl shadow-md shadow-indigo-500/25 px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
							>
								{creating ? "..." : t("createSession")}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Sessions list */}
			{loading ? (
				<div className="space-y-4">
					{(["s0", "s1", "s2"] as const).map((key) => (
						<div
							key={key}
							className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5"
						>
							<div className="flex items-center justify-between mb-4">
								<div className="space-y-2">
									<Skeleton height="1rem" width="9rem" />
									<Skeleton height="0.75rem" width="12rem" />
								</div>
								<Skeleton
									height="1.5rem"
									width="4rem"
									className="rounded-full"
								/>
							</div>
							<Skeleton height="0.5rem" className="rounded-full" />
						</div>
					))}
				</div>
			) : sessions.length === 0 ? (
				<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-12 text-center">
					<p className="text-zinc-500 dark:text-zinc-400 text-sm">
						{t("noSessions")}
					</p>
				</div>
			) : (
				<div className="space-y-4">
					{sessions.map((session, _sIdx) => (
						<div
							key={session.id}
							className="animate-fade-in opacity-0"
							style={{
								animationDelay: `${_sIdx * 70}ms`,
								animationFillMode: "forwards",
							}}
						>
							<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5">
								<div className="flex items-start justify-between gap-4 mb-4">
									<div className="min-w-0">
										<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
											{session.target_user_name}
										</h3>
										<p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
											{session.target_user_email}
										</p>
										{session.suspension_date && (
											<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
												{t("suspensionDate")}: {session.suspension_date}
											</p>
										)}
									</div>
									<div className="flex items-center gap-2 shrink-0">
										<span
											className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusBadgeClass(session.status)}`}
										>
											{statusLabel(session.status)}
										</span>
									</div>
								</div>

								{/* Progress bar */}
								<div className="mb-4">
									<div className="flex items-center justify-between mb-1">
										<span className="text-xs text-zinc-500 dark:text-zinc-400">
											{t("progress")}
										</span>
										<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
											{session.answered_questions}/{session.total_questions}{" "}
											{t("answered")}
										</span>
									</div>
									<div className="h-2 rounded-full bg-zinc-200 dark:bg-white/[0.06] overflow-hidden">
										<div
											className="h-full rounded-full bg-green-500 dark:bg-green-400 transition-all"
											style={{ width: `${session.progress_percent}%` }}
										/>
									</div>
								</div>

								{/* Actions */}
								<div className="flex items-center gap-2">
									<button
										type="button"
										onClick={() => {
											if (!detailLoading) {
												fetchDetail(session.id);
											}
										}}
										className="min-h-[44px] px-3 py-1.5 text-sm font-medium rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:brightness-110 text-white shadow-sm shadow-indigo-500/25 transition-[filter,transform] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
									>
										{t("viewDetails")}
									</button>
									{session.status !== "completed" && (
										<button
											type="button"
											onClick={() => handleToggle(session)}
											disabled={togglingId === session.id}
											className="min-h-[44px] px-3 py-1.5 text-sm font-medium rounded-xl border border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
										>
											{session.status === "paused"
												? t("resumeSession")
												: t("pauseSession")}
										</button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
