import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("privacy");
	return {
		title: t("pageTitle"),
	};
}

interface TrafficItem {
	text: string;
}

interface TrafficSection {
	level: "green" | "yellow" | "red";
	label: string;
	tagline: string;
	items: TrafficItem[];
	bg: string;
	border: string;
	dot: string;
	labelColor: string;
	taglineColor: string;
	itemColor: string;
}

export default async function PrivacyPage() {
	const t = await getTranslations("privacy");

	const TRAFFIC_LIGHT: TrafficSection[] = [
		{
			level: "green",
			label: t("greenLabel"),
			tagline: t("greenTagline"),
			items: [
				{ text: "General business questions and process queries" },
				{ text: "Publicly available information and industry research" },
				{
					text: "Template and format requests (e.g. email structure, report layout)",
				},
				{ text: "Learning, training, and professional development questions" },
			],
			bg: "bg-green-50 dark:bg-green-950/40",
			border: "border-green-200 dark:border-green-800",
			dot: "bg-green-500",
			labelColor: "text-green-800 dark:text-green-300",
			taglineColor: "text-green-600 dark:text-green-400",
			itemColor: "text-green-900 dark:text-green-200",
		},
		{
			level: "yellow",
			label: t("yellowLabel"),
			tagline: t("yellowTagline"),
			items: [
				{
					text: 'Internal project names — use codenames or aliases (e.g. "Project X")',
				},
				{ text: "General financial discussions — no specific figures" },
				{ text: "Team performance topics — no individual names" },
			],
			bg: "bg-amber-50 dark:bg-amber-950/40",
			border: "border-amber-200 dark:border-amber-800",
			dot: "bg-amber-500",
			labelColor: "text-amber-800 dark:text-amber-300",
			taglineColor: "text-amber-600 dark:text-amber-400",
			itemColor: "text-amber-900 dark:text-amber-200",
		},
		{
			level: "red",
			label: t("redLabel"),
			tagline: t("redTagline"),
			items: [
				{ text: "Client names or identifiers covered by NDA" },
				{ text: "Exact financial figures: revenue, salary, contract amounts" },
				{
					text: "Personal employee data: performance evaluations, medical records, disciplinary records",
				},
				{ text: "Passwords, API keys, tokens, or credentials of any kind" },
				{ text: "Verbatim legal documents or court-sensitive materials" },
			],
			bg: "bg-red-50 dark:bg-red-950/40",
			border: "border-red-200 dark:border-red-800",
			dot: "bg-red-500",
			labelColor: "text-red-800 dark:text-red-300",
			taglineColor: "text-red-600 dark:text-red-400",
			itemColor: "text-red-900 dark:text-red-200",
		},
	];

	const BEST_PRACTICES = [
		{
			title: "Use placeholder identifiers",
			body: 'Refer to clients as "Client A" or "Client B", and projects as "Project X" to keep context without exposing sensitive details.',
		},
		{
			title: "Ask about processes, not people",
			body: "Frame questions around workflows and systems rather than specific individuals. This protects privacy and often produces more useful answers.",
		},
		{
			title: "Review before sending",
			body: "Always review AI-generated content before sharing it with clients or externally. AI output may contain errors or unintended disclosures.",
		},
		{
			title: "Report concerns promptly",
			body: "If you accidentally submit restricted data, report it to your manager immediately. Early reporting minimises risk.",
		},
	];

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-stone-200 dark:border-stone-700/60 bg-white dark:bg-stone-900/80 px-6 py-4 shrink-0">
				<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
					{t("pageTitle")}
				</h1>
				<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
					{t("subtitle")}
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-6 print:p-8">
				<div className="max-w-3xl mx-auto space-y-10">
					{/* Introduction */}
					<section className="bg-stone-50 dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5">
						<p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
							{t.rich("intro", {
								bold: (chunks) => <strong>{chunks}</strong>,
								law: (chunks) => <strong>{chunks}</strong>,
							})}
						</p>
					</section>

					{/* Section 1: Traffic Light */}
					<section>
						<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
							{t("trafficTitle")}
						</h2>
						<p className="text-sm text-stone-500 dark:text-stone-400 mb-5">
							{t("trafficSub")}
						</p>

						<div className="space-y-4">
							{TRAFFIC_LIGHT.map((section) => (
								<div
									key={section.level}
									className={`rounded-xl border ${section.border} ${section.bg} p-5`}
								>
									<div className="flex items-center gap-2.5 mb-1">
										<span
											className={`w-3 h-3 rounded-full shrink-0 ${section.dot}`}
										/>
										<h3 className={`text-sm font-bold ${section.labelColor}`}>
											{section.label}
										</h3>
									</div>
									<p
										className={`text-xs font-medium mb-3 ml-5.5 ${section.taglineColor}`}
									>
										{section.tagline}
									</p>
									<ul className="space-y-1.5 ml-5.5">
										{section.items.map((item) => (
											<li
												key={item.text}
												className={`flex items-start gap-2 text-sm ${section.itemColor}`}
											>
												<span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0 opacity-50" />
												{item.text}
											</li>
										))}
									</ul>
								</div>
							))}
						</div>
					</section>

					{/* Section 2: Best Practices */}
					<section>
						<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
							{t("bestPracticesTitle")}
						</h2>
						<p className="text-sm text-stone-500 dark:text-stone-400 mb-5">
							{t("bestPracticesSub")}
						</p>

						<div className="grid sm:grid-cols-2 gap-4">
							{BEST_PRACTICES.map((bp) => (
								<div
									key={bp.title}
									className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm dark:shadow-none p-5"
								>
									<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">
										{bp.title}
									</h3>
									<p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
										{bp.body}
									</p>
								</div>
							))}
						</div>
					</section>

					{/* Section 3: Legal Basis */}
					<section>
						<h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
							{t("legalTitle")}
						</h2>
						<p className="text-sm text-stone-500 dark:text-stone-400 mb-5">
							{t("legalSub")}
						</p>

						<div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm dark:shadow-none p-6 space-y-6">
							{/* Data flow diagram */}
							<div>
								<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-3">
									{t("dataFlow")}
								</h3>
								<div className="flex flex-wrap items-center gap-2 text-sm">
									<div className="flex items-center gap-1.5 bg-stone-50 dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg px-3 py-2">
										<svg
											className="w-4 h-4 text-stone-500 dark:text-stone-400"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={1.75}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
											/>
										</svg>
										<span className="text-stone-700 dark:text-stone-300 font-medium">
											{t("yourInput")}
										</span>
									</div>
									<span className="text-stone-400 dark:text-stone-500">→</span>
									<div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2">
										<svg
											className="w-4 h-4 text-indigo-500"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={1.75}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z"
											/>
										</svg>
										<span className="text-indigo-700 dark:text-indigo-300 font-medium">
											{t("companyApi")}
										</span>
									</div>
									<span className="text-stone-400 dark:text-stone-500">→</span>
									<div className="flex items-center gap-1.5 bg-violet-50 dark:bg-violet-950/50 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2">
										<svg
											className="w-4 h-4 text-violet-500"
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
										<span className="text-violet-700 dark:text-violet-300 font-medium">
											{t("claudeAi")}
										</span>
									</div>
								</div>
							</div>

							{/* Key points */}
							<div className="space-y-3 pt-2 border-t border-stone-100 dark:border-stone-700">
								<div className="flex items-start gap-3">
									<span className="mt-0.5 w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 flex items-center justify-center shrink-0 text-xs font-bold">
										1
									</span>
									<div>
										<p className="text-sm font-medium text-stone-800 dark:text-stone-200">
											Philippines DPA 2012 compliance
										</p>
										<p className="text-sm text-stone-500 dark:text-stone-400">
											All personal data processed by this system falls under
											Republic Act 10173. Employees have rights to access,
											correct, and object to processing of their personal data.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<span className="mt-0.5 w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 text-xs font-bold">
										2
									</span>
									<div>
										<p className="text-sm font-medium text-stone-800 dark:text-stone-200">
											Anthropic API data policy
										</p>
										<p className="text-sm text-stone-500 dark:text-stone-400">
											Data sent through the Anthropic API is not used to train
											their models by default. See Anthropic's usage policy for
											full details.
										</p>
									</div>
								</div>
								<div className="flex items-start gap-3">
									<span className="mt-0.5 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 text-xs font-bold">
										3
									</span>
									<div>
										<p className="text-sm font-medium text-stone-800 dark:text-stone-200">
											Data retention
										</p>
										<p className="text-sm text-stone-500 dark:text-stone-400">
											Chat history is retained for 90 days to improve response
											quality and support auditing. Data is encrypted at rest
											and in transit. Deletion requests can be made to your
											system administrator.
										</p>
									</div>
								</div>
							</div>
						</div>
					</section>

					{/* Print footer */}
					<div className="hidden print:block text-xs text-stone-400 pt-4 border-t border-stone-200">
						{t("printFooter")}
					</div>
				</div>
			</div>
		</div>
	);
}
