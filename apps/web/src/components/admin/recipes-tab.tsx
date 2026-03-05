"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

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

// ---- RecipesTab -----------------------------------------------------------

export function RecipesTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
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
		return "text-zinc-500 bg-zinc-50 border-zinc-200 dark:text-zinc-400 dark:bg-[#1e1e24] dark:border-white/[0.06]";
	};

	const statusLabel = (status: string) => {
		if (status === "published") return t("statusPublished");
		if (status === "draft") return t("statusDraft");
		return t("statusArchived");
	};

	return (
		<div className="space-y-6 animate-fade-in">
			{/* Header */}
			<div className="flex items-start justify-between gap-4">
				<div>
					<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
						{t("pageTitle")}
					</h2>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
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
						className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-sm font-medium hover:brightness-110 transition-[filter,transform] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/25 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
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
				<div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
					{error}
				</div>
			)}

			{/* Recipe cards grid */}
			{loading ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{(["rc0", "rc1", "rc2", "rc3"] as const).map((key) => (
						<div
							key={key}
							className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5"
						>
							<Skeleton height="1rem" width="10rem" className="mb-2" />
							<Skeleton height="0.75rem" className="mb-1" />
							<Skeleton height="0.75rem" width="75%" className="mb-4" />
							<div className="flex gap-2">
								<Skeleton
									height="1.25rem"
									width="4rem"
									className="rounded-full"
								/>
								<Skeleton
									height="1.25rem"
									width="4rem"
									className="rounded-full"
								/>
							</div>
						</div>
					))}
				</div>
			) : recipes.length === 0 ? (
				<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-12 text-center">
					<p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
						{t("noRecipes")}
					</p>
					<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
						{t("noRecipesHint")}
					</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2">
					{recipes.map((recipe, _rIdx) => (
						<div
							key={recipe.id}
							className="animate-fade-in opacity-0"
							style={{
								animationDelay: `${_rIdx * 60}ms`,
								animationFillMode: "forwards",
							}}
						>
							<div className="bg-white dark:bg-[#1a1a1f] rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] p-5 flex flex-col gap-3">
								{/* Title + status */}
								<div className="flex items-start justify-between gap-2">
									<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
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
									<p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2">
										{recipe.description}
									</p>
								)}

								{/* Meta row */}
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
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
										aria-label={`Delete recipe ${recipe.title}`}
										disabled={deletingId === recipe.id}
										onClick={() => handleDelete(recipe.id)}
										className="min-h-[44px] inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-xl border transition-[colors,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none bg-red-50 border-red-200 text-red-700 hover:bg-red-100 hover:border-red-300 dark:bg-red-500/[0.08] dark:border-red-500/20 dark:text-red-300 dark:hover:bg-red-500/[0.15] dark:hover:border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
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
										{tAdmin("delete")}
									</button>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
