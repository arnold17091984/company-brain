import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Search",
};

export default function SearchPage() {
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
				{/* Search input */}
				<div className="max-w-2xl mx-auto">
					<div className="relative mb-8">
						<div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
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
						</div>
						<input
							type="search"
							placeholder="Search documents, policies, wikis..."
							className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
						/>
					</div>

					{/* Empty state */}
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
							Enter a query above to search documents, Notion pages, Confluence
							articles, and more.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
