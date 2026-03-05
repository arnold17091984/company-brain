"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { SkeletonCard } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/session";
import type { Source } from "@/types";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const RECENT_SEARCHES_KEY = "company-brain:recent-searches";
const MAX_RECENT = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult extends Source {
	sourceType?: string;
}

interface SearchApiResponse {
	answer: string;
	sources: SearchResult[];
	cached: boolean;
}

type SourceFilter = "all" | "drive" | "notion" | "telegram";
type TimeFilter = "all" | "week" | "month";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

/**
 * Inject inline citation anchors `[N]` into AI answer text so the user can
 * see which statement maps to which source.  The backend returns references as
 * `[1]`, `[2]` etc. — we leave them as-is because MarkdownRenderer will render
 * them as plain text, which is the desired Perplexity-style look.
 */
function buildAnswerWithCitations(
	answer: string,
	sources: SearchResult[],
): string {
	if (!sources.length) return answer;
	// If citations are already present (e.g. [1]) keep the text unchanged; the
	// source list below provides the resolution.
	return answer;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadRecentSearches(): string[] {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
		return raw ? (JSON.parse(raw) as string[]) : [];
	} catch {
		return [];
	}
}

function saveRecentSearches(searches: string[]): void {
	if (typeof window === "undefined") return;
	try {
		localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches));
	} catch {
		// quota exceeded — silently ignore
	}
}

function pushRecentSearch(query: string, current: string[]): string[] {
	const trimmed = query.trim();
	if (!trimmed) return current;
	const filtered = current.filter((s) => s !== trimmed);
	return [trimmed, ...filtered].slice(0, MAX_RECENT);
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("w-5 h-5", className)}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
			/>
		</svg>
	);
}

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("h-5 w-5 animate-spin", className)}
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
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

function CloseIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("w-3.5 h-3.5", className)}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={2.5}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M6 18L18 6M6 6l12 12"
			/>
		</svg>
	);
}

function ClockIcon({ className }: { className?: string }) {
	return (
		<svg
			className={cn("w-3.5 h-3.5", className)}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			strokeWidth={1.75}
			aria-hidden="true"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
			/>
		</svg>
	);
}

function SourceTypeIcon({ type }: { type?: string }) {
	if (type === "notion") {
		return (
			<svg
				className="w-3.5 h-3.5"
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
	}
	if (type === "drive") {
		return (
			<svg
				className="w-3.5 h-3.5"
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
	}
	if (type === "telegram") {
		return (
			<svg
				className="w-3.5 h-3.5"
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
	}
	return (
		<svg
			className="w-3.5 h-3.5"
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
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

interface FilterChipsProps {
	sourceFilter: SourceFilter;
	timeFilter: TimeFilter;
	onSourceChange: (v: SourceFilter) => void;
	onTimeChange: (v: TimeFilter) => void;
}

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "drive", label: "Google Drive" },
	{ value: "notion", label: "Notion" },
	{ value: "telegram", label: "Telegram" },
];

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
	{ value: "all", label: "All time" },
	{ value: "week", label: "Past week" },
	{ value: "month", label: "Past month" },
];

function FilterChips({
	sourceFilter,
	timeFilter,
	onSourceChange,
	onTimeChange,
}: FilterChipsProps) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
			{/* Source type group */}
			<div className="flex items-center gap-1.5">
				{SOURCE_FILTERS.map((f, i) => (
					<button
						key={f.value}
						type="button"
						onClick={() => onSourceChange(f.value)}
						aria-pressed={sourceFilter === f.value}
						className={cn(
							"animate-fade-in transition-[color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
							"text-xs font-medium px-3 py-1 rounded-full border",
							sourceFilter === f.value
								? "bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500"
								: "bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200",
						)}
						style={{ animationDelay: `${i * 40}ms` }}
					>
						{f.label}
					</button>
				))}
			</div>

			<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

			{/* Time period group */}
			<div className="flex items-center gap-1.5">
				{TIME_FILTERS.map((f, i) => (
					<button
						key={f.value}
						type="button"
						onClick={() => onTimeChange(f.value)}
						aria-pressed={timeFilter === f.value}
						className={cn(
							"animate-fade-in transition-[color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
							"text-xs font-medium px-3 py-1 rounded-full border",
							timeFilter === f.value
								? "bg-indigo-600 border-indigo-600 text-white dark:bg-indigo-500 dark:border-indigo-500"
								: "bg-white dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-600 hover:text-zinc-900 dark:hover:text-zinc-200",
						)}
						style={{ animationDelay: `${(SOURCE_FILTERS.length + i) * 40}ms` }}
					>
						{f.label}
					</button>
				))}
			</div>
		</div>
	);
}

// ─── Recent Searches Dropdown ─────────────────────────────────────────────────

interface RecentSearchesDropdownProps {
	items: string[];
	onSelect: (q: string) => void;
	onRemove: (q: string) => void;
}

function RecentSearchesDropdown({
	items,
	onSelect,
	onRemove,
}: RecentSearchesDropdownProps) {
	if (!items.length) return null;

	return (
		<div className="animate-slide-down absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg dark:shadow-black/40 py-1 overflow-hidden">
			<p className="px-3 pt-1.5 pb-1 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
				Recent
			</p>
			{items.map((item) => (
				<div
					key={item}
					className="group flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors duration-100"
				>
					<ClockIcon className="shrink-0 text-zinc-400 dark:text-zinc-500" />
					<button
						type="button"
						onClick={() => onSelect(item)}
						className="flex-1 text-left text-sm text-zinc-700 dark:text-zinc-300 truncate"
					>
						{item}
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onRemove(item);
						}}
						aria-label={`Remove "${item}" from recent searches`}
						className="shrink-0 p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
					>
						<CloseIcon />
					</button>
				</div>
			))}
		</div>
	);
}

// ─── AI Answer Card ───────────────────────────────────────────────────────────

interface AnswerCardProps {
	answer: string;
	sources: SearchResult[];
}

function AnswerCard({ answer, sources }: AnswerCardProps) {
	const annotatedAnswer = buildAnswerWithCitations(answer, sources);

	return (
		<div className="animate-fade-in mb-6 rounded-xl border border-indigo-200/60 dark:border-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/20 p-5 card-glow">
			{/* Header */}
			<div className="flex items-center gap-2 mb-4">
				<div className="w-6 h-6 rounded-full bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shrink-0">
					<svg
						className="w-3 h-3 text-amber-300"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
						/>
					</svg>
				</div>
				<span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 tracking-wide uppercase">
					AI Answer
				</span>
				<Badge variant="primary" size="sm" className="ml-auto">
					{sources.length} {sources.length === 1 ? "source" : "sources"}
				</Badge>
			</div>

			{/* Answer body — uses shared MarkdownRenderer */}
			<MarkdownRenderer
				content={annotatedAnswer}
				className="text-sm [&_p]:text-zinc-800 dark:[&_p]:text-zinc-200 [&_p]:leading-relaxed"
			/>

			{/* Source references */}
			{sources.length > 0 && (
				<div className="mt-5 pt-4 border-t border-indigo-200/50 dark:border-indigo-500/10">
					<p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
						Sources
					</p>
					<div className="flex flex-col gap-1.5">
						{sources.map((src, idx) => (
							<a
								key={src.url}
								href={src.url}
								target="_blank"
								rel="noopener noreferrer"
								className="group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-150 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30"
							>
								{/* Citation number */}
								<span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center leading-none">
									{idx + 1}
								</span>

								{/* Icon */}
								<span className="shrink-0 text-zinc-400 dark:text-zinc-500">
									<SourceTypeIcon type={src.sourceType} />
								</span>

								{/* Title */}
								<span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 truncate transition-colors duration-150">
									{src.title}
								</span>

								{/* Source type badge */}
								{src.sourceType && (
									<Badge
										variant="default"
										size="sm"
										className="shrink-0 capitalize"
									>
										{src.sourceType}
									</Badge>
								)}
							</a>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
	result,
	index,
}: { result: SearchResult; index: number }) {
	const formattedDate = new Date(result.updatedAt).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<a
			href={result.url}
			target="_blank"
			rel="noopener noreferrer"
			className="animate-fade-in group flex flex-col gap-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800/40 p-4 card-glow gradient-border"
			style={{ animationDelay: `${index * 60}ms` }}
		>
			<div className="flex items-start gap-3">
				{/* Source icon */}
				<div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
					<SourceTypeIcon type={result.sourceType} />
				</div>

				<div className="flex-1 min-w-0">
					<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 line-clamp-1 transition-colors duration-150">
						{result.title}
					</h3>
					<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2 leading-relaxed">
						{result.snippet}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2 pt-0.5">
				{result.sourceType && (
					<Badge variant="default" size="sm" className="capitalize">
						{result.sourceType}
					</Badge>
				)}
				{result.score !== undefined && (
					<Badge variant="primary" size="sm">
						{Math.round(result.score * 100)}% match
					</Badge>
				)}
				<span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
					{formattedDate}
				</span>
			</div>
		</a>
	);
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
	return (
		<div
			className="flex flex-col gap-3"
			aria-label="Loading results"
			aria-busy="true"
		>
			{/* Answer card skeleton */}
			<div className="mb-3 rounded-xl border border-indigo-200/40 dark:border-indigo-500/10 bg-indigo-50/30 dark:bg-indigo-950/10 p-5">
				<div className="flex items-center gap-2 mb-4">
					<div className="skeleton w-6 h-6 rounded-full" />
					<div className="skeleton h-3 w-20 rounded" />
				</div>
				<div className="flex flex-col gap-2">
					<div className="skeleton h-3 w-full rounded" />
					<div className="skeleton h-3 w-11/12 rounded" />
					<div className="skeleton h-3 w-4/5 rounded" />
					<div className="skeleton h-3 w-9/12 rounded mt-1" />
					<div className="skeleton h-3 w-3/4 rounded" />
				</div>
			</div>
			{/* Result card skeletons */}
			{[0, 1, 2].map((i) => (
				<SkeletonCard key={i} />
			))}
		</div>
	);
}

// ─── Filter helpers ───────────────────────────────────────────────────────────

function applyFilters(
	results: SearchResult[],
	sourceFilter: SourceFilter,
	timeFilter: TimeFilter,
): SearchResult[] {
	let filtered = results;

	if (sourceFilter !== "all") {
		filtered = filtered.filter((r) => r.sourceType === sourceFilter);
	}

	if (timeFilter !== "all") {
		const now = Date.now();
		const cutoff =
			timeFilter === "week"
				? now - 7 * 24 * 60 * 60 * 1000
				: now - 30 * 24 * 60 * 60 * 1000;
		filtered = filtered.filter(
			(r) => new Date(r.updatedAt).getTime() >= cutoff,
		);
	}

	return filtered;
}

// ─── Search Page ──────────────────────────────────────────────────────────────

export default function SearchPage() {
	const { data: session } = useSession();
	const t = useTranslations("search");

	// Core search state
	const [query, setQuery] = useState("");
	const [answer, setAnswer] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasSearched, setHasSearched] = useState(false);

	// Filter state
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

	// Recent searches
	const [recentSearches, setRecentSearches] = useState<string[]>([]);
	const [showRecent, setShowRecent] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Load recent searches from localStorage on mount
	useEffect(() => {
		setRecentSearches(loadRecentSearches());
	}, []);

	// Close dropdown when clicking outside
	useEffect(() => {
		function handlePointerDown(e: PointerEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node) &&
				inputRef.current &&
				!inputRef.current.contains(e.target as Node)
			) {
				setShowRecent(false);
			}
		}
		document.addEventListener("pointerdown", handlePointerDown);
		return () => document.removeEventListener("pointerdown", handlePointerDown);
	}, []);

	const runSearch = useCallback(
		async (searchQuery: string) => {
			const trimmed = searchQuery.trim();
			if (!trimmed) return;

			const accessToken = getAccessToken(session);

			setIsLoading(true);
			setError(null);
			setHasSearched(true);
			setShowRecent(false);

			// Reset filters on new search
			setSourceFilter("all");
			setTimeFilter("all");

			// Persist to recent searches
			setRecentSearches((prev) => {
				const updated = pushRecentSearch(trimmed, prev);
				saveRecentSearches(updated);
				return updated;
			});

			try {
				const response = await fetch(`${API_BASE_URL}/api/v1/knowledge/query`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({ query: trimmed }),
				});

				if (!response.ok) {
					throw new Error(
						`Search failed: ${response.status} ${response.statusText}`,
					);
				}

				const data: SearchApiResponse = await response.json();
				setAnswer(data.answer ?? "");
				setResults(data.sources ?? []);
			} catch (err) {
				const isNetworkError =
					err instanceof TypeError &&
					err.message.toLowerCase().includes("fetch");
				const message = isNetworkError
					? "Cannot connect to API server. Make sure the backend is running on port 8000."
					: err instanceof Error
						? err.message
						: "An unexpected error occurred";
				setError(message);
				setAnswer("");
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		},
		[session],
	);

	function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			runSearch(query);
		}
		if (e.key === "Escape") {
			setShowRecent(false);
		}
	}

	function handleSelectRecent(q: string) {
		setQuery(q);
		setShowRecent(false);
		runSearch(q);
	}

	function handleRemoveRecent(q: string) {
		setRecentSearches((prev) => {
			const updated = prev.filter((s) => s !== q);
			saveRecentSearches(updated);
			return updated;
		});
	}

	const filteredResults = applyFilters(results, sourceFilter, timeFilter);
	const hasResults = filteredResults.length > 0 || Boolean(answer);

	return (
		<div className="flex flex-col h-full animate-fade-in">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-5 bg-premium-dark">
				<div className="max-w-2xl mx-auto">
					{/* ── Search input ── */}
					<div className="relative mb-6">
						<div className="relative flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/80 shadow-sm input-premium">
							{/* Left icon */}
							<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
								{isLoading ? (
									<SpinnerIcon className="text-indigo-500" />
								) : (
									<SearchIcon className="text-zinc-400 dark:text-zinc-500" />
								)}
							</div>

							{/* Input */}
							<input
								ref={inputRef}
								type="search"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyDown={handleKeyDown}
								onFocus={() => {
									if (!query.trim() && recentSearches.length > 0) {
										setShowRecent(true);
									}
								}}
								onInput={() => {
									if (query.trim()) setShowRecent(false);
								}}
								placeholder={t("placeholder")}
								disabled={isLoading}
								autoComplete="off"
								className="w-full bg-transparent py-3.5 pl-12 pr-24 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
							/>

							{/* Search button */}
							{query.trim() && (
								<button
									type="button"
									onClick={() => runSearch(query)}
									disabled={isLoading}
									aria-label="Search"
									className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-4 pl-3 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm font-medium disabled:opacity-50 transition-[color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
								>
									{t("button")}
								</button>
							)}
						</div>

						{/* Recent searches dropdown */}
						{showRecent && (
							<div ref={dropdownRef}>
								<RecentSearchesDropdown
									items={recentSearches}
									onSelect={handleSelectRecent}
									onRemove={handleRemoveRecent}
								/>
							</div>
						)}
					</div>

					{/* ── Error state ── */}
					{error && (
						<ErrorBanner
							message={error}
							onDismiss={() => setError(null)}
							className="mb-6"
						/>
					)}

					{/* ── Loading state ── */}
					{isLoading && <LoadingSkeleton />}

					{/* ── Results ── */}
					{hasSearched && !isLoading && !error && (
						<div className="animate-fade-in">
							{/* Filter chips — only shown after a search */}
							<FilterChips
								sourceFilter={sourceFilter}
								timeFilter={timeFilter}
								onSourceChange={setSourceFilter}
								onTimeChange={setTimeFilter}
							/>

							{/* AI answer card */}
							{answer && <AnswerCard answer={answer} sources={results} />}

							{/* Result count */}
							{filteredResults.length > 0 && (
								<p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3">
									{t("resultsFound", { count: filteredResults.length })}
								</p>
							)}

							{/* Result cards */}
							{filteredResults.length > 0 && (
								<div className="flex flex-col gap-3">
									{filteredResults.map((result, idx) => (
										<ResultCard key={result.url} result={result} index={idx} />
									))}
								</div>
							)}

							{/* Post-search empty state */}
							{!answer && filteredResults.length === 0 && (
								<EmptyState
									icon={<SearchIcon className="w-6 h-6" />}
									title={t("noResults")}
									subtitle={t("noResultsHint")}
									action={
										sourceFilter !== "all" || timeFilter !== "all"
											? {
													label: "Clear filters",
													onClick: () => {
														setSourceFilter("all");
														setTimeFilter("all");
													},
												}
											: undefined
									}
								/>
							)}
						</div>
					)}

					{/* ── Initial empty state ── */}
					{!hasSearched && !isLoading && (
						<EmptyState
							icon={<SearchIcon className="w-6 h-6" />}
							title={t("emptyTitle")}
							subtitle={t("emptySubtitle")}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
