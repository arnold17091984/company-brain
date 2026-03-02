"use client";

import type { Source } from "@/types";
import { useSession } from "next-auth/react";
import { type KeyboardEvent, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SearchResult extends Source {
	sourceType?: string;
}

interface SearchApiResponse {
	results: SearchResult[];
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
			className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
		>
			<div className="flex items-start gap-3">
				<div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
					<SourceTypeIcon type={result.sourceType} />
				</div>
				<div className="flex-1 min-w-0">
					<h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 line-clamp-1 transition-colors">
						{result.title}
					</h3>
					<p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
						{result.snippet}
					</p>
				</div>
			</div>
			<div className="flex items-center gap-2 mt-1">
				{result.sourceType && (
					<span className="text-xs text-slate-400 capitalize bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
						{result.sourceType}
					</span>
				)}
				<span className="text-xs text-slate-400 ml-auto">{formattedDate}</span>
			</div>
		</a>
	);
}

function ResultsSection({
	results,
}: {
	results: SearchResult[];
}) {
	if (results.length > 0) {
		return (
			<div>
				<p className="text-xs text-slate-400 mb-3">
					{results.length} {results.length === 1 ? "result" : "results"} found
				</p>
				<div className="flex flex-col gap-3">
					{results.map((result) => (
						<ResultCard key={result.url} result={result} />
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
				<svg
					className="w-8 h-8 text-slate-400"
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
			<p className="text-slate-700 font-medium">No results found</p>
			<p className="text-slate-400 text-sm mt-1 max-w-xs">
				Try different keywords or check your spelling.
			</p>
		</div>
	);
}

export default function SearchPage() {
	const { data: session } = useSession();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [hasSearched, setHasSearched] = useState(false);

	async function runSearch(searchQuery: string) {
		if (!searchQuery.trim()) return;

		const accessToken = (session as { accessToken?: string } | null)
			?.accessToken;

		setIsLoading(true);
		setError(null);
		setHasSearched(true);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			if (accessToken) {
				headers.Authorization = `Bearer ${accessToken}`;
			}

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
			setResults(data.results ?? []);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "An unexpected error occurred";
			setError(message);
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
			<div className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
				<h1 className="text-lg font-semibold text-slate-900">Search</h1>
				<p className="text-sm text-slate-500 mt-0.5">
					Search across all company knowledge
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-2xl mx-auto">
					{/* Search input */}
					<div className="relative mb-6">
						<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							{isLoading ? (
								<svg
									className="h-5 w-5 text-blue-500 animate-spin"
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
									className="h-5 w-5 text-slate-400"
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
							placeholder="Search documents, policies, wikis..."
							disabled={isLoading}
							className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
						/>
						{query.trim() && (
							<button
								type="button"
								onClick={() => runSearch(query)}
								disabled={isLoading}
								className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
							>
								Search
							</button>
						)}
					</div>

					{/* Error state */}
					{error && (
						<div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
							<svg
								className="w-4 h-4 text-red-500 flex-shrink-0"
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
							<p className="text-sm text-red-700">{error}</p>
						</div>
					)}

					{/* Results after search */}
					{hasSearched && !isLoading && !error && (
						<ResultsSection results={results} />
					)}

					{/* Initial empty state */}
					{!hasSearched && (
						<div className="flex flex-col items-center justify-center py-16 text-center">
							<div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
								<svg
									className="w-8 h-8 text-slate-400"
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
							<p className="text-slate-700 font-medium">
								Search across all company knowledge
							</p>
							<p className="text-slate-400 text-sm mt-1 max-w-xs">
								Enter a query above to search documents, Notion pages,
								Confluence articles, and more.
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
