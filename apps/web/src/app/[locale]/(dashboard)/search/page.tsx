"use client";

import { getAccessToken } from "@/lib/session";
import type { Source } from "@/types";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SearchResult extends Source {
	sourceType?: string;
}

interface SearchApiResponse {
	answer: string;
	sources: SearchResult[];
	cached: boolean;
}

function SourceTypeIcon({ type }: { type?: string }) {
	if (type === "notion") {
		return (
			<svg
				className="w-4 h-4"
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
				className="w-4 h-4"
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
				className="w-4 h-4"
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

	// Default: document icon
	return (
		<svg
			className="w-4 h-4"
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

function ResultCard({ result }: { result: SearchResult }) {
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
			className="group flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 hover:border-zinc-300 dark:hover:border-zinc-600 transition-[border-color] duration-150"
		>
			<div className="flex items-start gap-3">
				<div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 flex items-center justify-center">
					<SourceTypeIcon type={result.sourceType} />
				</div>
				<div className="flex-1 min-w-0">
					<h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 line-clamp-1 transition-colors">
						{result.title}
					</h3>
					<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
						{result.snippet}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-2 mt-1">
				{result.sourceType && (
					<span className="text-xs text-zinc-400 dark:text-zinc-500 capitalize bg-zinc-50 dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded-full px-2 py-0.5">
						{result.sourceType}
					</span>
				)}
				<span className="text-xs text-zinc-400 dark:text-zinc-500 ml-auto">
					{formattedDate}
				</span>
			</div>
		</a>
	);
}

function AnswerCard({ answer }: { answer: string }) {
	return (
		<div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-5">
			<div className="flex items-center gap-2 mb-3">
				<div className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center">
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
				<span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
					AI Answer
				</span>
			</div>
			<div className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed">
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					components={{
						p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
						strong: ({ children }) => (
							<strong className="font-semibold">{children}</strong>
						),
						ul: ({ children }) => (
							<ul className="mb-2 last:mb-0 ml-4 list-disc space-y-1">
								{children}
							</ul>
						),
						ol: ({ children }) => (
							<ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-1">
								{children}
							</ol>
						),
						li: ({ children }) => <li>{children}</li>,
						h1: ({ children }) => (
							<h1 className="text-base font-bold mb-2 mt-3 first:mt-0">
								{children}
							</h1>
						),
						h2: ({ children }) => (
							<h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">
								{children}
							</h2>
						),
						h3: ({ children }) => (
							<h3 className="text-sm font-medium mb-1 mt-2 first:mt-0">
								{children}
							</h3>
						),
						code: ({ className, children, ...props }) => {
							const isBlock = className?.includes("language-");
							if (isBlock) {
								return (
									<code
										className="block bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 my-2 text-xs font-mono overflow-x-auto whitespace-pre"
										{...props}
									>
										{children}
									</code>
								);
							}
							return (
								<code
									className="bg-white dark:bg-zinc-900 rounded px-1.5 py-0.5 text-xs font-mono"
									{...props}
								>
									{children}
								</code>
							);
						},
						pre: ({ children }) => (
							<div className="my-2 last:mb-0">{children}</div>
						),
						a: ({ href, children }) => (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="text-indigo-600 dark:text-indigo-400 hover:underline"
							>
								{children}
							</a>
						),
					}}
				>
					{answer}
				</ReactMarkdown>
			</div>
		</div>
	);
}

function ResultsSection({
	answer,
	results,
	t,
}: {
	answer: string;
	results: SearchResult[];
	t: ReturnType<typeof useTranslations<"search">>;
}) {
	return (
		<div>
			{answer && <AnswerCard answer={answer} />}

			{results.length > 0 && (
				<div>
					<p className="text-xs text-zinc-400 mb-3">
						{t("resultsFound", { count: results.length })}
					</p>
					<div className="flex flex-col gap-3">
						{results.map((result) => (
							<ResultCard key={result.url} result={result} />
						))}
					</div>
				</div>
			)}

			{!answer && results.length === 0 && (
				<div className="flex flex-col items-center justify-center py-16 text-center">
					<div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
						<svg
							className="w-8 h-8 text-zinc-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={1.5}
							aria-hidden="true"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
							/>
						</svg>
					</div>
					<p className="text-zinc-700 dark:text-zinc-200 font-medium">
						{t("noResults")}
					</p>
					<p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1 max-w-xs">
						{t("noResultsHint")}
					</p>
				</div>
			)}
		</div>
	);
}

export default function SearchPage() {
	const { data: session } = useSession();
	const t = useTranslations("search");
	const [query, setQuery] = useState("");
	const [answer, setAnswer] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasSearched, setHasSearched] = useState(false);

	async function runSearch(searchQuery: string) {
		if (!searchQuery.trim()) return;

		const accessToken = getAccessToken(session);

		setIsLoading(true);
		setError(null);
		setHasSearched(true);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			};

			const response = await fetch(`${API_BASE_URL}/api/v1/knowledge/query`, {
				method: "POST",
				headers,
				body: JSON.stringify({ query: searchQuery }),
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
			const networkError =
				err instanceof TypeError && err.message.toLowerCase().includes("fetch");
			const message = networkError
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
	}

	function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			runSearch(query);
		}
	}

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md px-8 py-4 shrink-0">
				<h1 className="text-lg font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-5">
				<div className="max-w-2xl mx-auto">
					{/* Search input */}
					<div className="relative mb-6">
						<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							{isLoading ? (
								<svg
									className="h-5 w-5 text-indigo-500 animate-spin"
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
							) : (
								<svg
									className="h-5 w-5 text-zinc-400"
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
							)}
						</div>
						<input
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t("placeholder")}
							disabled={isLoading}
							className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-3 pl-11 pr-4 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
						/>
						{query.trim() && (
							<button
								type="button"
								onClick={() => runSearch(query)}
								disabled={isLoading}
								className="absolute inset-y-0 right-0 flex items-center pr-4 text-indigo-600 hover:text-indigo-700 text-sm font-medium disabled:opacity-50"
							>
								{t("button")}
							</button>
						)}
					</div>

					{/* Error state */}
					{error && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 mb-6">
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
									d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
								/>
							</svg>
							<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
						</div>
					)}

					{/* Results after search */}
					{hasSearched && !isLoading && !error && (
						<ResultsSection answer={answer} results={results} t={t} />
					)}

					{/* Initial empty state */}
					{!hasSearched && (
						<div className="flex flex-col items-center justify-center py-16 text-center">
							<div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
								<svg
									className="w-8 h-8 text-zinc-400"
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
							</div>
							<p className="text-zinc-700 dark:text-zinc-200 font-medium">
								{t("emptyTitle")}
							</p>
							<p className="text-zinc-400 dark:text-zinc-500 text-sm mt-1 max-w-xs">
								{t("emptySubtitle")}
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
