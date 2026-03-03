"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Category = "all" | "cs" | "marketing" | "development" | "accounting" | "general_affairs";
type SortMode = "popular" | "recent" | "mine";

interface Template {
	id: string;
	title: string;
	description: string;
	category: string;
	vote_count: number;
	copy_count: number;
	author_name: string;
	user_id: string;
	created_at: string;
}

interface TemplatesResponse {
	items: Template[];
	total: number;
	page: number;
	page_size: number;
}

const CATEGORIES: { id: Category; labelKey: string }[] = [
	{ id: "all", labelKey: "categoryAll" },
	{ id: "cs", labelKey: "categoryCs" },
	{ id: "marketing", labelKey: "categoryMarketing" },
	{ id: "development", labelKey: "categoryDevelopment" },
	{ id: "accounting", labelKey: "categoryAccounting" },
	{ id: "general_affairs", labelKey: "categoryGeneralAffairs" },
];

const CATEGORY_COLORS: Record<string, string> = {
	cs: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
	marketing: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
	development: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
	accounting: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
	general_affairs: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

function CategoryBadge({ category }: { category: string }) {
	const colorClass = CATEGORY_COLORS[category] ?? "bg-stone-50 text-stone-600 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600";
	return (
		<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
			{category.replace("_", " ")}
		</span>
	);
}

function SkeletonCard() {
	return (
		<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 shadow-sm animate-pulse">
			<div className="flex items-start justify-between gap-3 mb-3">
				<div className="h-4 w-40 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-5 w-20 bg-stone-100 dark:bg-stone-600 rounded-full" />
			</div>
			<div className="space-y-2 mb-4">
				<div className="h-3 w-full bg-stone-100 dark:bg-stone-600 rounded" />
				<div className="h-3 w-3/4 bg-stone-100 dark:bg-stone-600 rounded" />
			</div>
			<div className="flex items-center gap-4">
				<div className="h-3 w-16 bg-stone-100 dark:bg-stone-600 rounded" />
				<div className="h-3 w-16 bg-stone-100 dark:bg-stone-600 rounded" />
			</div>
		</div>
	);
}

function TemplateCard({
	template,
	onVote,
	onCopy,
	votedIds,
	copiedIds,
}: {
	template: Template;
	onVote: (id: string) => void;
	onCopy: (id: string) => void;
	votedIds: Set<string>;
	copiedIds: Set<string>;
}) {
	const t = useTranslations("templates");
	const voted = votedIds.has(template.id);
	const copied = copiedIds.has(template.id);

	return (
		<div className="group bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-3">
			<div className="flex items-start justify-between gap-3">
				<Link
					href={`./templates/${template.id}`}
					className="text-sm font-semibold text-stone-900 dark:text-stone-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug"
				>
					{template.title}
				</Link>
				<CategoryBadge category={template.category} />
			</div>

			{template.description && (
				<p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2 leading-relaxed">
					{template.description}
				</p>
			)}

			<div className="flex items-center justify-between mt-auto pt-1">
				<span className="text-xs text-stone-400 dark:text-stone-500">
					{template.author_name}
				</span>

				<div className="flex items-center gap-2 min-h-[36px]">
					{/* Vote button */}
					<button
						type="button"
						onClick={() => onVote(template.id)}
						title={t("vote")}
						className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors min-w-[36px] ${
							voted
								? "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
								: "bg-stone-50 text-stone-500 border border-stone-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:bg-stone-700 dark:text-stone-400 dark:border-stone-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
						}`}
					>
						<svg className="w-3.5 h-3.5" fill={voted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
						</svg>
						{template.vote_count}
					</button>

					{/* Copy button */}
					<button
						type="button"
						onClick={() => onCopy(template.id)}
						title={t("copy")}
						className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors min-w-[36px] ${
							copied
								? "bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-700"
								: "bg-stone-50 text-stone-500 border border-stone-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:bg-stone-700 dark:text-stone-400 dark:border-stone-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
						}`}
					>
						<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
						</svg>
						{template.copy_count}
					</button>
				</div>
			</div>
		</div>
	);
}

export default function TemplatesPage() {
	const { data: session } = useSession();
	const t = useTranslations("templates");

	const [templates, setTemplates] = useState<Template[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [category, setCategory] = useState<Category>("all");
	const [sort, setSort] = useState<SortMode>("popular");
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
	const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

	const PAGE_SIZE = 12;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const getToken = useCallback(() => {
		return (session as { accessToken?: string } | null)?.accessToken ?? "dev-token";
	}, [session]);

	const loadTemplates = useCallback(async (cat: Category, sortMode: SortMode, pg: number) => {
		setIsLoading(true);
		setError(null);
		try {
			const params = new URLSearchParams({
				page: String(pg),
				page_size: String(PAGE_SIZE),
				sort: sortMode,
			});
			if (cat !== "all") params.set("category", cat);
			if (sortMode === "mine") params.set("mine", "true");

			const res = await fetch(`${API_BASE_URL}/api/v1/templates?${params.toString()}`, {
				headers: { Authorization: `Bearer ${getToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			const data: TemplatesResponse = await res.json();
			setTemplates(data.items ?? []);
			setTotal(data.total ?? 0);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load templates");
			setTemplates([]);
		} finally {
			setIsLoading(false);
		}
	}, [getToken]);

	useEffect(() => {
		loadTemplates(category, sort, page);
	}, [category, sort, page, loadTemplates]);

	const handleVote = useCallback(async (id: string) => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/templates/${id}/vote`, {
				method: "POST",
				headers: { Authorization: `Bearer ${getToken()}` },
			});
			if (!res.ok) return;
			setVotedIds((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id); else next.add(id);
				return next;
			});
			setTemplates((prev) =>
				prev.map((t) =>
					t.id === id
						? { ...t, vote_count: votedIds.has(id) ? t.vote_count - 1 : t.vote_count + 1 }
						: t,
				),
			);
		} catch {
			// silent
		}
	}, [getToken, votedIds]);

	const handleCopy = useCallback(async (id: string) => {
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/templates/${id}/copy`, {
				method: "POST",
				headers: { Authorization: `Bearer ${getToken()}` },
			});
			if (!res.ok) return;
			setCopiedIds((prev) => new Set(prev).add(id));
			setTemplates((prev) =>
				prev.map((t) => (t.id === id ? { ...t, copy_count: t.copy_count + 1 } : t)),
			);
		} catch {
			// silent
		}
	}, [getToken]);

	const handleCategoryChange = (cat: Category) => {
		setCategory(cat);
		setPage(1);
	};

	const handleSortChange = (s: SortMode) => {
		setSort(s);
		setPage(1);
	};

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
							{t("pageTitle")}
						</h1>
						<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="./templates/new"
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors dark:bg-indigo-700 dark:hover:bg-indigo-600 shrink-0"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
							<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
						{t("newTemplate")}
					</Link>
				</div>
			</div>

			{/* Filters */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 shrink-0">
				<div className="flex items-center justify-between gap-4 flex-wrap py-2">
					{/* Category tabs */}
					<nav className="flex gap-0.5 -mb-px flex-wrap" aria-label="Category filter">
						{CATEGORIES.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => handleCategoryChange(cat.id)}
								className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
									category === cat.id
										? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
										: "border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300 dark:text-stone-400 dark:hover:text-stone-200 dark:hover:border-stone-600"
								}`}
							>
								{t(cat.labelKey as Parameters<typeof t>[0])}
							</button>
						))}
					</nav>

					{/* Sort selector */}
					<select
						value={sort}
						onChange={(e) => handleSortChange(e.target.value as SortMode)}
						className="px-3 py-1.5 text-sm rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
					>
						<option value="popular">{t("sortPopular")}</option>
						<option value="recent">{t("sortRecent")}</option>
						<option value="mine">{t("sortMy")}</option>
					</select>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-6xl mx-auto">
					{error && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-6">
							<svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
							</svg>
							<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
						</div>
					)}

					{isLoading ? (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{Array.from({ length: 9 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
								<SkeletonCard key={i} />
							))}
						</div>
					) : templates.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 text-center">
							<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-indigo-900/20 ring-1 ring-indigo-200/50 dark:ring-indigo-700/30 flex items-center justify-center mb-4">
								<svg className="w-9 h-9 text-indigo-400 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
									<path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
								</svg>
							</div>
							<p className="text-stone-700 dark:text-stone-200 font-medium">{t("noTemplates")}</p>
							<p className="text-stone-400 dark:text-stone-500 text-sm mt-1 max-w-xs">{t("noTemplatesHint")}</p>
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{templates.map((tpl) => (
								<TemplateCard
									key={tpl.id}
									template={tpl}
									onVote={handleVote}
									onCopy={handleCopy}
									votedIds={votedIds}
									copiedIds={copiedIds}
								/>
							))}
						</div>
					)}

					{/* Pagination */}
					{!isLoading && total > PAGE_SIZE && (
						<div className="flex items-center justify-between mt-8 px-1">
							<p className="text-xs text-stone-500 dark:text-stone-400">
								{t("pagination", { page, total: totalPages })}
							</p>
							<div className="flex items-center gap-2">
								<button
									type="button"
									disabled={page <= 1}
									onClick={() => setPage((p) => Math.max(1, p - 1))}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
								>
									<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
									</svg>
									{t("prev")}
								</button>
								<button
									type="button"
									disabled={page >= totalPages}
									onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
									className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-stone-600"
								>
									{t("next")}
									<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
										<path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
									</svg>
								</button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
