"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Recipe {
	id: string;
	title: string;
	description: string;
	department: string;
	category: string;
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

const DEPT_COLORS: Record<string, string> = {
	cs: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
	marketing: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
	development: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
	accounting: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
	general_affairs: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
	hr: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
};

function StarRating({ score }: { score: number }) {
	const stars = Math.round(score * 5);
	return (
		<div className="flex items-center gap-0.5" aria-label={`${score * 100}% effectiveness`}>
			{Array.from({ length: 5 }).map((_, i) => (
				<svg
					// biome-ignore lint/suspicious/noArrayIndexKey: static star ratings
					key={i}
					className={`w-3.5 h-3.5 ${i < stars ? "text-amber-400" : "text-stone-200 dark:text-stone-600"}`}
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

function SkeletonCard() {
	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 animate-pulse">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="h-4 w-40 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-5 w-20 bg-stone-100 dark:bg-stone-600 rounded-full" />
			</div>
			<div className="space-y-2 mb-3">
				<div className="h-3 w-full bg-stone-100 dark:bg-stone-600 rounded" />
				<div className="h-3 w-4/5 bg-stone-100 dark:bg-stone-600 rounded" />
			</div>
			<div className="flex items-center gap-3">
				<div className="h-3.5 w-20 bg-stone-100 dark:bg-stone-600 rounded" />
				<div className="h-3 w-12 bg-stone-100 dark:bg-stone-600 rounded" />
			</div>
		</div>
	);
}

function RecipeCard({ recipe, isExpanded, onToggle }: { recipe: Recipe; isExpanded: boolean; onToggle: () => void }) {
	const t = useTranslations("recipes");
	const [promptCopied, setPromptCopied] = useState(false);
	const deptColor = DEPT_COLORS[recipe.department] ?? "bg-stone-50 text-stone-600 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600";

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

	return (
		<div className={`bg-white dark:bg-stone-800 rounded-xl border transition-all duration-200 ${isExpanded ? "border-indigo-300 dark:border-indigo-600 shadow-md" : "border-stone-200 dark:border-stone-700 hover:border-indigo-200 dark:hover:border-indigo-700 hover:shadow-sm hover:-translate-y-0.5"}`}>
			{/* Card header - clickable */}
			<button
			type="button"
			onClick={onToggle}
			aria-expanded={isExpanded}
			className="w-full text-left p-5"
		>
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1.5 flex-wrap">
							<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${deptColor}`}>
								{recipe.department.replace("_", " ")}
							</span>
							{recipe.category && (
								<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600">
									{recipe.category}
								</span>
							)}
						</div>
						<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug">
							{recipe.title}
						</h3>
						{recipe.description && (
							<p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
								{recipe.description}
							</p>
						)}
					</div>
					<svg
						className={`w-4 h-4 text-stone-400 shrink-0 mt-0.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
					>
						<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
					</svg>
				</div>

				<div className="flex items-center gap-4 mt-3">
					<StarRating score={recipe.effectiveness_score} />
					<span className="text-xs text-stone-400 dark:text-stone-500">
						{recipe.usage_count} {t("usages")}
					</span>
				</div>
			</button>

			{/* Expanded content */}
			{isExpanded && (
				<div className="border-t border-stone-100 dark:border-stone-700 p-5 space-y-4">
					{/* Prompt template */}
					<div>
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
								{t("promptTemplate")}
							</span>
							<button
								type="button"
								onClick={handleCopyPrompt}
								className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-stone-500 hover:bg-stone-100 transition-colors dark:text-stone-400 dark:hover:bg-stone-700"
							>
								{promptCopied ? (
									<>
										<svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
										</svg>
										{t("copied")}
									</>
								) : (
									<>
										<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
											<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z" />
										</svg>
										{t("copy")}
									</>
								)}
							</button>
						</div>
						<pre className="text-xs font-mono text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-900/40 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed border border-stone-100 dark:border-stone-700">
							{recipe.prompt_template}
						</pre>
					</div>

					{/* Example Q&A */}
					{(recipe.example_query || recipe.example_response) && (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{recipe.example_query && (
								<div>
									<p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
										{t("exampleQuery")}
									</p>
									<div className="text-xs text-stone-600 dark:text-stone-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900 leading-relaxed">
										{recipe.example_query}
									</div>
								</div>
							)}
							{recipe.example_response && (
								<div>
									<p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-2">
										{t("exampleResponse")}
									</p>
									<div className="text-xs text-stone-600 dark:text-stone-400 bg-green-50/50 dark:bg-green-950/20 rounded-lg p-3 border border-green-100 dark:border-green-900 leading-relaxed">
										{recipe.example_response}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}
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
	const searchRef = useRef<HTMLInputElement>(null);

	const getToken = useCallback(() => {
		return (session as { accessToken?: string } | null)?.accessToken ?? "dev-token";
	}, [session]);

	const loadRecipes = useCallback(async (q: string, dept: string, cat: string) => {
		setIsLoading(true);
		setError(null);
		try {
			const params = new URLSearchParams({ page_size: "50" });
			if (q.trim()) params.set("search", q.trim());
			if (dept) params.set("department", dept);
			if (cat) params.set("category", cat);

			const res = await fetch(`${API_BASE_URL}/api/v1/recipes?${params.toString()}`, {
				headers: { Authorization: `Bearer ${getToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			const data: RecipesResponse = await res.json();
			const items = data.items ?? [];
			setRecipes(items);

			// Derive filter options from data on first unfiltered load
			if (!q && !dept && !cat) {
				setDepartments([...new Set(items.map((r) => r.department).filter(Boolean))]);
				setCategories([...new Set(items.map((r) => r.category).filter(Boolean))]);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load recipes");
			setRecipes([]);
		} finally {
			setIsLoading(false);
		}
	}, [getToken]);

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

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t("pageTitle")}</h1>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">{t("subtitle")}</p>
			</div>

			{/* Filters */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 px-6 py-3 shrink-0">
				<div className="flex items-center gap-3 flex-wrap">
					{/* Search */}
					<form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1 min-w-[200px] max-w-sm">
						<div className="relative flex-1">
							<svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
							</svg>
							<input
								ref={searchRef}
								type="search"
								value={searchInput}
								onChange={(e) => setSearchInput(e.target.value)}
								placeholder={t("searchPlaceholder")}
								className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone-200 bg-stone-50 text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent dark:border-stone-600 dark:bg-stone-700 dark:text-stone-100 dark:placeholder-stone-500"
							/>
						</div>
						<button type="submit" className="px-3 py-2 text-sm font-medium rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600">
							{t("search")}
						</button>
					</form>

					{/* Department filter */}
					{departments.length > 0 && (
						<select
							value={department}
							onChange={(e) => { setDepartment(e.target.value); setExpandedId(null); }}
							className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
						>
							<option value="">{t("allDepartments")}</option>
							{departments.map((d) => (
								<option key={d} value={d}>{d.replace("_", " ")}</option>
							))}
						</select>
					)}

					{/* Category filter */}
					{categories.length > 0 && (
						<select
							value={category}
							onChange={(e) => { setCategory(e.target.value); setExpandedId(null); }}
							className="px-3 py-2 text-sm rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
						>
							<option value="">{t("allCategories")}</option>
							{categories.map((c) => (
								<option key={c} value={c}>{c}</option>
							))}
						</select>
					)}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-4xl mx-auto">
					{error && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-6">
							<svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
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
					) : recipes.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 text-center">
							<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-indigo-900/20 ring-1 ring-indigo-200/50 dark:ring-indigo-700/30 flex items-center justify-center mb-4">
								<svg className="w-9 h-9 text-indigo-400 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
								</svg>
							</div>
							<p className="text-stone-700 dark:text-stone-200 font-medium">{t("noRecipes")}</p>
							<p className="text-stone-400 dark:text-stone-500 text-sm mt-1">{t("noRecipesHint")}</p>
						</div>
					) : (
						<div className="space-y-3">
							<p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
								{t("recipesFound", { count: recipes.length })}
							</p>
							{recipes.map((recipe) => (
								<RecipeCard
									key={recipe.id}
									recipe={recipe}
									isExpanded={expandedId === recipe.id}
									onToggle={() => handleToggle(recipe.id)}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
