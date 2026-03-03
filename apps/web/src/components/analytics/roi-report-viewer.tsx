"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ROIReport {
	period: string;
	total_queries: number;
	total_tokens: number;
	active_users: number;
	avg_satisfaction_pct: number;
	estimated_hours_saved: number;
	estimated_cost_usd: number;
	report_markdown: string;
}

interface StatCard {
	label: string;
	value: string;
	sub?: string;
	iconPath: string;
	iconBg: string;
	iconColor: string;
}

function buildStatCards(report: ROIReport): StatCard[] {
	return [
		{
			label: "Total Queries",
			value: report.total_queries.toLocaleString(),
			sub: `Period: ${report.period}`,
			iconPath: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
			iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
			iconColor: "text-indigo-600 dark:text-indigo-400",
		},
		{
			label: "Active Users",
			value: String(report.active_users),
			iconPath: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
			iconBg: "bg-green-50 dark:bg-green-950/50",
			iconColor: "text-green-600 dark:text-green-400",
		},
		{
			label: "Hours Saved",
			value: `${report.estimated_hours_saved.toFixed(1)} hrs`,
			sub: "Estimated productivity gain",
			iconPath: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
			iconBg: "bg-amber-50 dark:bg-amber-950/50",
			iconColor: "text-amber-600 dark:text-amber-400",
		},
		{
			label: "Satisfaction",
			value: `${report.avg_satisfaction_pct.toFixed(0)}%`,
			sub: "Average user satisfaction",
			iconPath: "M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z",
			iconBg: "bg-rose-50 dark:bg-rose-950/50",
			iconColor: "text-rose-600 dark:text-rose-400",
		},
		{
			label: "Token Usage",
			value: report.total_tokens.toLocaleString(),
			sub: "Total tokens consumed",
			iconPath: "M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776",
			iconBg: "bg-violet-50 dark:bg-violet-950/50",
			iconColor: "text-violet-600 dark:text-violet-400",
		},
		{
			label: "Estimated Cost",
			value: `$${report.estimated_cost_usd.toFixed(2)}`,
			sub: "LLM API cost for period",
			iconPath: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
			iconBg: "bg-sky-50 dark:bg-sky-950/50",
			iconColor: "text-sky-600 dark:text-sky-400",
		},
	];
}

interface ROIReportViewerProps {
	report: ROIReport;
}

export function ROIReportViewer({ report }: ROIReportViewerProps) {
	const statCards = buildStatCards(report);

	return (
		<div className="space-y-6">
			{/* Summary stats grid */}
			<div role="region" aria-label="ROI Summary Statistics" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
				{statCards.map((card) => (
					<div
						key={card.label}
						className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-4 shadow-sm"
					>
						<div className={`w-8 h-8 rounded-lg ${card.iconBg} ${card.iconColor} flex items-center justify-center mb-3`}>
							<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d={card.iconPath} />
							</svg>
						</div>
						<p className="text-xs text-stone-500 dark:text-stone-400 leading-tight mb-1">{card.label}</p>
						<p className="text-lg font-bold tabular-nums tracking-tight text-stone-900 dark:text-stone-100 leading-none">{card.value}</p>
						{card.sub && (
							<p className="text-xs text-stone-400 dark:text-stone-500 mt-1 leading-tight">{card.sub}</p>
						)}
					</div>
				))}
			</div>

			{/* Markdown report */}
			{report.report_markdown && (
				<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-6">
					<div className="flex items-center gap-2 mb-4">
						<div className="w-6 h-6 rounded-full bg-indigo-700 flex items-center justify-center">
							<svg className="w-3 h-3 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
								<path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
							</svg>
						</div>
						<h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200">ROI Analysis Report</h3>
					</div>

					<div className="prose prose-sm dark:prose-invert max-w-none text-stone-700 dark:text-stone-300">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={{
								h1: ({ children }) => (
									<h1 className="text-lg font-bold text-stone-900 dark:text-stone-100 mb-3 mt-5 first:mt-0">{children}</h1>
								),
								h2: ({ children }) => (
									<h2 className="text-base font-semibold text-stone-800 dark:text-stone-200 mb-2 mt-4 first:mt-0">{children}</h2>
								),
								h3: ({ children }) => (
									<h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1.5 mt-3 first:mt-0">{children}</h3>
								),
								p: ({ children }) => (
									<p className="text-sm leading-relaxed mb-3 last:mb-0">{children}</p>
								),
								ul: ({ children }) => (
									<ul className="mb-3 ml-4 list-disc space-y-1.5 last:mb-0">{children}</ul>
								),
								ol: ({ children }) => (
									<ol className="mb-3 ml-4 list-decimal space-y-1.5 last:mb-0">{children}</ol>
								),
								li: ({ children }) => (
									<li className="text-sm leading-relaxed">{children}</li>
								),
								strong: ({ children }) => (
									<strong className="font-semibold text-stone-900 dark:text-stone-100">{children}</strong>
								),
								blockquote: ({ children }) => (
									<blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 pl-4 py-1 my-3 text-stone-600 dark:text-stone-400 italic">
										{children}
									</blockquote>
								),
								code: ({ className, children, ...props }) => {
									const isBlock = className?.includes("language-");
									if (isBlock) {
										return (
											<code
												className="block bg-stone-50 dark:bg-stone-900 rounded-lg px-4 py-3 my-3 text-xs font-mono overflow-x-auto whitespace-pre border border-stone-200 dark:border-stone-700"
												{...props}
											>
												{children}
											</code>
										);
									}
									return (
										<code
											className="bg-stone-100 dark:bg-stone-700 rounded px-1.5 py-0.5 text-xs font-mono text-stone-800 dark:text-stone-200"
											{...props}
										>
											{children}
										</code>
									);
								},
								pre: ({ children }) => <div className="my-3 last:mb-0">{children}</div>,
								table: ({ children }) => (
									<div className="overflow-x-auto my-4 rounded-lg border border-stone-200 dark:border-stone-700">
										<table className="min-w-full text-sm">{children}</table>
									</div>
								),
								thead: ({ children }) => (
									<thead className="bg-stone-50 dark:bg-stone-700/50">{children}</thead>
								),
								th: ({ children }) => (
									<th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wider border-b border-stone-200 dark:border-stone-700">
										{children}
									</th>
								),
								td: ({ children }) => (
									<td className="px-4 py-2.5 text-xs text-stone-700 dark:text-stone-300 border-b border-stone-100 dark:border-stone-700 last:border-0">
										{children}
									</td>
								),
							}}
						>
							{report.report_markdown}
						</ReactMarkdown>
					</div>
				</div>
			)}
		</div>
	);
}
