"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonCard } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Category =
	| "all"
	| "cs"
	| "marketing"
	| "development"
	| "accounting"
	| "general_affairs";
type SortMode = "popular" | "recent" | "mine";

interface Template {
	id: string;
	title: string;
	description: string;
	category: string;
	content?: string;
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

const CATEGORY_VARIANT: Record<
	string,
	"default" | "primary" | "success" | "warning" | "danger" | "info"
> = {
	cs: "info",
	marketing: "danger",
	development: "primary",
	accounting: "success",
	general_affairs: "warning",
};

function TemplatePreviewModal({
	template,
	onClose,
}: {
	template: Template | null;
	onClose: () => void;
}) {
	const t = useTranslations("templates");
	const router = useRouter();

	if (!template) return null;

	const handleUseInChat = () => {
		const params = new URLSearchParams({ template: template.id });
		if (template.content) params.set("content", template.content);
		router.push(`/chat?${params.toString()}`);
		onClose();
	};

	return (
		<Modal
			isOpen={template !== null}
			onClose={onClose}
			title={t("previewTitle")}
			size="lg"
		>
			<div className="space-y-4">
				{/* Title + badge */}
				<div className="flex items-start justify-between gap-3">
					<h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
						{template.title}
					</h3>
					<Badge
						variant={CATEGORY_VARIANT[template.category] ?? "default"}
						size="md"
					>
						{template.category.replace("_", " ")}
					</Badge>
				</div>

				{/* Description */}
				{template.description && (
					<p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
						{template.description}
					</p>
				)}

				{/* Content */}
				{template.content && (
					<div>
						<p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
							{t("promptContent")}
						</p>
						<pre className="text-sm font-mono text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed border border-zinc-100 dark:border-zinc-800 max-h-60 overflow-y-auto">
							{template.content}
						</pre>
					</div>
				)}

				{/* Author */}
				<p className="text-xs text-zinc-400 dark:text-zinc-500">
					{t("by", { name: template.author_name })}
				</p>

				{/* CTA */}
				<div className="flex items-center gap-3 pt-2">
					<button
						type="button"
						onClick={handleUseInChat}
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
								d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
							/>
						</svg>
						{t("useInChat")}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
					>
						{t("cancel")}
					</button>
				</div>
			</div>
		</Modal>
	);
}

function TemplateCard({
	template,
	onVote,
	onCopy,
	onPreview,
	votedIds,
	copiedIds,
	index,
}: {
	template: Template;
	onVote: (id: string) => void;
	onCopy: (id: string) => void;
	onPreview: (template: Template) => void;
	votedIds: Set<string>;
	copiedIds: Set<string>;
	index: number;
}) {
	const t = useTranslations("templates");
	const router = useRouter();
	const voted = votedIds.has(template.id);
	const copied = copiedIds.has(template.id);

	const handleUseInChat = (e: React.MouseEvent) => {
		e.stopPropagation();
		const params = new URLSearchParams({ template: template.id });
		if (template.content) params.set("content", template.content);
		router.push(`/chat?${params.toString()}`);
	};

	return (
		<div
			className="card-glow group bg-white dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 animate-fade-in hover:border-indigo-300 dark:hover:border-indigo-600/50 transition-all flex flex-col"
			style={{ animationDelay: `${index * 40}ms` }}
		>
			{/* Clickable preview area */}
			<button
				type="button"
				onClick={() => onPreview(template)}
				className="text-left p-5 flex flex-col gap-3 flex-1 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 rounded-t-2xl"
				aria-label={`Preview template: ${template.title}`}
			>
				{/* Header */}
				<div className="flex items-start justify-between gap-3">
					<span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors line-clamp-2 leading-snug">
						{template.title}
					</span>
					<Badge
						variant={CATEGORY_VARIANT[template.category] ?? "default"}
						size="sm"
					>
						{template.category.replace("_", " ")}
					</Badge>
				</div>

				{/* Description */}
				{template.description && (
					<p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
						{template.description}
					</p>
				)}
			</button>

			{/* Footer */}
			<div className="flex items-center justify-between px-5 pb-4 pt-0">
				<span className="text-xs text-zinc-400 dark:text-zinc-500">
					{template.author_name}
				</span>

				<div className="flex items-center gap-2 min-h-[36px]">
					{/* Vote button */}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onVote(template.id);
						}}
						title={t("vote")}
						className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-w-[36px] ${
							voted
								? "bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
								: "bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:bg-zinc-700 dark:text-zinc-400 dark:border-zinc-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
						}`}
					>
						<svg
							className="w-3.5 h-3.5"
							fill={voted ? "currentColor" : "none"}
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
						{template.vote_count}
					</button>

					{/* Copy button */}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onCopy(template.id);
						}}
						title={t("copy")}
						className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-w-[36px] ${
							copied
								? "bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-700"
								: "bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:bg-zinc-700 dark:text-zinc-400 dark:border-zinc-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
						}`}
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
								d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
							/>
						</svg>
						{template.copy_count}
					</button>

					{/* Use in Chat button */}
					<button
						type="button"
						onClick={handleUseInChat}
						title={t("useInChat")}
						className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
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
						{t("useInChat")}
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
	const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

	const PAGE_SIZE = 12;
	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	const loadTemplates = useCallback(
		async (cat: Category, sortMode: SortMode, pg: number) => {
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

				const res = await fetch(
					`${API_BASE_URL}/api/v1/templates?${params.toString()}`,
					{
						headers: { Authorization: `Bearer ${getToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: TemplatesResponse = await res.json();
				setTemplates(data.items ?? []);
				setTotal(data.total ?? 0);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load templates",
				);
				setTemplates([]);
			} finally {
				setIsLoading(false);
			}
		},
		[getToken],
	);

	useEffect(() => {
		loadTemplates(category, sort, page);
	}, [category, sort, page, loadTemplates]);

	const handleVote = useCallback(
		async (id: string) => {
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/templates/${id}/vote`, {
					method: "POST",
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) return;
				setVotedIds((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
				setTemplates((prev) =>
					prev.map((tpl) =>
						tpl.id === id
							? {
									...tpl,
									vote_count: votedIds.has(id)
										? tpl.vote_count - 1
										: tpl.vote_count + 1,
								}
							: tpl,
					),
				);
			} catch {
				// silent
			}
		},
		[getToken, votedIds],
	);

	const handleCopy = useCallback(
		async (id: string) => {
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/templates/${id}/copy`, {
					method: "POST",
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) return;
				setCopiedIds((prev) => new Set(prev).add(id));
				setTemplates((prev) =>
					prev.map((tpl) =>
						tpl.id === id ? { ...tpl, copy_count: tpl.copy_count + 1 } : tpl,
					),
				);
			} catch {
				// silent
			}
		},
		[getToken],
	);

	const handleCategoryChange = (cat: Category) => {
		setCategory(cat);
		setPage(1);
	};

	const handleSortChange = (s: SortMode) => {
		setSort(s);
		setPage(1);
	};

	return (
		<div className="flex flex-col h-full animate-fade-in">
			{/* Template Preview Modal */}
			<TemplatePreviewModal
				template={previewTemplate}
				onClose={() => setPreviewTemplate(null)}
			/>

			{/* Header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
							{t("pageTitle")}
						</h1>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
							{t("subtitle")}
						</p>
					</div>
					<Link
						href="./templates/new"
						className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-indigo-700 dark:hover:bg-indigo-600 shrink-0"
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
						{t("newTemplate")}
					</Link>
				</div>
			</div>

			{/* Filters */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 shrink-0">
				<div className="flex items-center justify-between gap-4 flex-wrap py-2">
					{/* Category tabs */}
					<nav
						className="flex gap-0.5 -mb-px flex-wrap"
						aria-label="Category filter"
					>
						{CATEGORIES.map((cat) => (
							<button
								key={cat.id}
								type="button"
								onClick={() => handleCategoryChange(cat.id)}
								className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
									category === cat.id
										? "border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400"
										: "border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:border-zinc-600"
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
						className="px-3 py-1.5 text-sm rounded-lg border border-zinc-200 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
					>
						<option value="popular">{t("sortPopular")}</option>
						<option value="recent">{t("sortRecent")}</option>
						<option value="mine">{t("sortMy")}</option>
					</select>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-5">
				<div className="max-w-6xl mx-auto">
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
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{Array.from({ length: 9 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
								<SkeletonCard key={i} />
							))}
						</div>
					) : templates.length === 0 ? (
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
										d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
									/>
								</svg>
							}
							title={t("noTemplates")}
							subtitle={t("noTemplatesHint")}
						/>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{templates.map((tpl, index) => (
								<TemplateCard
									key={tpl.id}
									template={tpl}
									onVote={handleVote}
									onCopy={handleCopy}
									onPreview={setPreviewTemplate}
									votedIds={votedIds}
									copiedIds={copiedIds}
									index={index}
								/>
							))}
						</div>
					)}

					{/* Pagination */}
					{!isLoading && total > PAGE_SIZE && (
						<div className="mt-8 px-1">
							<Pagination
								page={page}
								totalPages={totalPages}
								totalItems={total}
								onPageChange={setPage}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
