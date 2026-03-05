"use client";

import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { SkeletonCard } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FAVORITES_KEY = "recipe_favorites";

interface Recipe {
	id: string;
	title: string;
	description: string;
	department: string;
	category: string;
	status?: string;
	effectiveness_score: number;
	usage_count: number;
	prompt_template: string;
	example_query: string;
	example_response: string;
}

interface RecipesResponse {
	items: Recipe[];
	total: number;
}

const DEPT_BADGE_VARIANT: Record<string, BadgeVariant> = {
	cs: "info",
	marketing: "danger",
	development: "primary",
	accounting: "success",
	general_affairs: "warning",
	hr: "danger",
};

const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
	draft: "default",
	published: "success",
	archived: "warning",
};

function StarRating({ score }: { score: number }) {
	const stars = Math.round(score * 5);
	return (
		<div
			className="flex items-center gap-0.5"
			aria-label={`${Math.round(score * 100)}% effectiveness`}
		>
			{Array.from({ length: 5 }).map((_, i) => (
				<svg
					// biome-ignore lint/suspicious/noArrayIndexKey: static star ratings
					key={i}
					className={`w-3.5 h-3.5 ${i < stars ? "text-amber-400" : "text-zinc-200 dark:text-zinc-600"}`}
					fill="currentColor"
					viewBox="0 0 20 20"
					aria-hidden="true"
				>
					<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
				</svg>
			))}
		</div>
	);
}

function FavoriteButton({
	isFavorited,
	onToggle,
}: {
	isFavorited: boolean;
	onToggle: (e: React.MouseEvent) => void;
}) {
	const t = useTranslations("recipes");
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-label={isFavorited ? t("favorited") : t("favorites")}
			className={`p-1.5 rounded-lg transition-colors ${
				isFavorited
					? "text-rose-500 hover:text-rose-600 dark:text-rose-400"
					: "text-zinc-400 hover:text-rose-500 dark:text-zinc-500 dark:hover:text-rose-400"
			}`}
		>
			<svg
				className="w-4 h-4"
				fill={isFavorited ? "currentColor" : "none"}
				viewBox="0 0 24 24"
				stroke="currentColor"
				strokeWidth={2}
				aria-hidden="true"
			>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
				/>
			</svg>
		</button>
	);
}

function RecipeCard({
	recipe,
	isExpanded,
	onToggle,
	isFavorited,
	onFavoriteToggle,
	index,
}: {
	recipe: Recipe;
	isExpanded: boolean;
	onToggle: () => void;
	isFavorited: boolean;
	onFavoriteToggle: (id: string) => void;
	index: number;
}) {
	const t = useTranslations("recipes");
	const router = useRouter();
	const [promptCopied, setPromptCopied] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);

	const deptVariant: BadgeVariant =
		DEPT_BADGE_VARIANT[recipe.department] ?? "default";
	const statusVariant: BadgeVariant =
		STATUS_BADGE_VARIANT[recipe.status ?? ""] ?? "default";

	const handleCopyPrompt = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(recipe.prompt_template);
			setPromptCopied(true);
			setTimeout(() => setPromptCopied(false), 2000);
		} catch {
			// silent
		}
	};

	const handleTryInChat = (e: React.MouseEvent) => {
		e.stopPropagation();
		const params = new URLSearchParams({ recipe: recipe.id });
		if (recipe.prompt_template) params.set("content", recipe.prompt_template);
		router.push(`/chat?${params.toString()}`);
	};

	return (
		<div
			className={`card-glow animate-fade-in bg-white dark:bg-zinc-800/60 rounded-2xl border transition-all ${
				isExpanded
					? "border-indigo-300 dark:border-indigo-600/60"
					: "border-zinc-200 dark:border-zinc-700/60"
			}`}
			style={{ animationDelay: `${index * 40}ms` }}
		>
			{/* Card header - clickable */}
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={isExpanded}
				className="w-full text-left p-5"
			>
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						{/* Badges row */}
						<div className="flex items-center gap-2 mb-1.5 flex-wrap">
							<Badge variant={deptVariant} size="sm">
								{recipe.department.replace("_", " ")}
							</Badge>
							{recipe.category && (
								<Badge variant="default" size="sm">
									{recipe.category}
								</Badge>
							)}
							{recipe.status && recipe.status !== "published" && (
								<Badge variant={statusVariant} size="sm">
									{t(
										`status${recipe.status.charAt(0).toUpperCase()}${recipe.status.slice(1)}` as Parameters<
											typeof t
										>[0],
									)}
								</Badge>
							)}
						</div>

						{/* Title */}
						<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-snug group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
							{recipe.title}
						</h3>

						{/* Description */}
						{recipe.description && (
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
								{recipe.description}
							</p>
						)}
					</div>

					{/* Right: favorite + chevron */}
					<div className="flex items-center gap-1 shrink-0">
						<FavoriteButton
							isFavorited={isFavorited}
							onToggle={(e) => {
								e.stopPropagation();
								onFavoriteToggle(recipe.id);
							}}
						/>
						<svg
							className={`w-4 h-4 text-zinc-400 mt-0.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</div>
				</div>

				{/* Stats row */}
				<div className="flex items-center gap-4 mt-3">
					<StarRating score={recipe.effectiveness_score} />
					<span className="text-xs text-zinc-400 dark:text-zinc-500">
						{t("usages", { count: recipe.usage_count })}
					</span>
				</div>
			</button>

			{/* Expanded content — CSS-driven smooth expand */}
			<div
				ref={contentRef}
				className="overflow-hidden transition-all duration-300 ease-in-out"
				style={{
					maxHeight: isExpanded ? "1200px" : "0px",
					opacity: isExpanded ? 1 : 0,
				}}
				aria-hidden={!isExpanded}
			>
				<div className="border-t border-zinc-100 dark:border-zinc-700/60 p-5 space-y-4">
					{/* Prompt template */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
								{t("promptTemplate")}
							</span>
							<div className="flex items-center gap-2">
								{/* Copy prompt */}
								<button
									type="button"
									onClick={handleCopyPrompt}
									className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-500 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-700"
								>
									{promptCopied ? (
										<>
											<svg
												className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												strokeWidth={2.5}
												aria-hidden="true"
											>
												<path
													strokeLinecap="round"
													strokeLinejoin="round"
													d="M4.5 12.75l6 6 9-13.5"
												/>
											</svg>
											{t("copied")}
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
													d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z"
												/>
											</svg>
											{t("copy")}
										</>
									)}
								</button>

								{/* Try in Chat */}
								<button
									type="button"
									onClick={handleTryInChat}
									className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
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
											d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
										/>
									</svg>
									{t("tryInChat")}
								</button>
							</div>
						</div>

						{/* Prompt displayed via MarkdownRenderer */}
						<div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-4 max-h-72 overflow-y-auto">
							<MarkdownRenderer
								content={recipe.prompt_template}
								className="text-xs"
							/>
						</div>
					</div>

					{/* Example Q&A */}
					{(recipe.example_query || recipe.example_response) && (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{recipe.example_query && (
								<div>
									<p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
										{t("exampleQuery")}
									</p>
									<div className="text-xs text-zinc-600 dark:text-zinc-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-900 leading-relaxed">
										{recipe.example_query}
									</div>
								</div>
							)}
							{recipe.example_response && (
								<div>
									<p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
										{t("exampleResponse")}
									</p>
									<div className="text-xs text-zinc-600 dark:text-zinc-400 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-3 border border-emerald-100 dark:border-emerald-900 leading-relaxed">
										{recipe.example_response}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default function RecipesPage() {
	const { data: session } = useSession();
	const t = useTranslations("recipes");

	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [department, setDepartment] = useState("");
	const [category, setCategory] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [departments, setDepartments] = useState<string[]>([]);
	const [categories, setCategories] = useState<string[]>([]);
	const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
	const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	// Load favorites from localStorage on mount
	useEffect(() => {
		try {
			const stored = localStorage.getItem(FAVORITES_KEY);
			if (stored) {
				setFavoriteIds(new Set(JSON.parse(stored) as string[]));
			}
		} catch {
			// ignore parse errors
		}
	}, []);

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	const loadRecipes = useCallback(
		async (q: string, dept: string, cat: string) => {
			setIsLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({ page_size: "50" });
				if (q.trim()) params.set("search", q.trim());
				if (dept) params.set("department", dept);
				if (cat) params.set("category", cat);

				const res = await fetch(
					`${API_BASE_URL}/api/v1/recipes?${params.toString()}`,
					{
						headers: { Authorization: `Bearer ${getToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: RecipesResponse = await res.json();
				const items = data.items ?? [];
				setRecipes(items);

				// Derive filter options from data on first unfiltered load
				if (!q && !dept && !cat) {
					setDepartments([
						...new Set(items.map((r) => r.department).filter(Boolean)),
					]);
					setCategories([
						...new Set(items.map((r) => r.category).filter(Boolean)),
					]);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load recipes");
				setRecipes([]);
			} finally {
				setIsLoading(false);
			}
		},
		[getToken],
	);

	useEffect(() => {
		loadRecipes(search, department, category);
	}, [search, department, category, loadRecipes]);

	const handleSearchSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setSearch(searchInput);
		setExpandedId(null);
	};

	const handleToggle = (id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	};

	const handleFavoriteToggle = useCallback((id: string) => {
		setFavoriteIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			try {
				localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next]));
			} catch {
				// ignore storage errors
			}
			return next;
		});
	}, []);

	const displayedRecipes = showFavoritesOnly
		? recipes.filter((r) => favoriteIds.has(r.id))
		: recipes;

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			{/* Filters */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-950/80 px-8 py-3 shrink-0">
				<div className="flex items-center gap-3 flex-wrap">
					{/* Search */}
					<form
						onSubmit={handleSearchSubmit}
						className="flex gap-2 flex-1 min-w-[200px] max-w-sm"
					>
						<div className="relative flex-1">
							<svg
								className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.75}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
								/>
							</svg>
							<input
								ref={searchRef}
								type="search"
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								placeholder={t("searchPlaceholder")}
								className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100 dark:placeholder-zinc-500"
							/>
						</div>
						<button
							type="submit"
							className="px-3 py-2 text-sm font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
						>
							{t("search")}
						</button>
					</form>

					{/* Department filter */}
					{departments.length > 0 && (
						<select
							value={department}
							onChange={(e) => {
								setDepartment(e.target.value);
								setExpandedId(null);
							}}
							className="px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
						>
							<option value="">{t("allDepartments")}</option>
							{departments.map((d) => (
								<option key={d} value={d}>
									{d.replace("_", " ")}
								</option>
							))}
						</select>
					)}

					{/* Category filter */}
					{categories.length > 0 && (
						<select
							value={category}
							onChange={(e) => {
								setCategory(e.target.value);
								setExpandedId(null);
							}}
							className="px-3 py-2 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
						>
							<option value="">{t("allCategories")}</option>
							{categories.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					)}

					{/* Favorites toggle */}
					<button
						type="button"
						onClick={() => setShowFavoritesOnly((v) => !v)}
						className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
							showFavoritesOnly
								? "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
								: "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-zinc-700"
						}`}
					>
						<svg
							className="w-4 h-4"
							fill={showFavoritesOnly ? "currentColor" : "none"}
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
							/>
						</svg>
						{showFavoritesOnly ? t("favorites") : t("showFavorites")}
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-5">
				<div className="max-w-4xl mx-auto">
					{error && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-6">
							<svg
								className="w-4 h-4 text-red-500 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
								/>
							</svg>
							<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
						</div>
					)}

					{isLoading ? (
						<div className="space-y-4">
							{Array.from({ length: 6 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton items
								<SkeletonCard key={i} />
							))}
						</div>
					) : displayedRecipes.length === 0 ? (
						<EmptyState
							icon={
								<svg
									className="w-7 h-7"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={1.5}
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
									/>
								</svg>
							}
							title={t("noRecipes")}
							subtitle={t("noRecipesHint")}
							action={
								showFavoritesOnly
									? {
											label: t("allRecipes"),
											onClick: () => setShowFavoritesOnly(false),
										}
									: undefined
							}
						/>
					) : (
						<div className="space-y-3">
							<p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
								{t("recipesFound", { count: displayedRecipes.length })}
							</p>
							{displayedRecipes.map((recipe, index) => (
								<RecipeCard
									key={recipe.id}
									recipe={recipe}
									isExpanded={expandedId === recipe.id}
									onToggle={() => handleToggle(recipe.id)}
									isFavorited={favoriteIds.has(recipe.id)}
									onFavoriteToggle={handleFavoriteToggle}
									index={index}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
