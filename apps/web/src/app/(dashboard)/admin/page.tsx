import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Admin",
};

function SectionCard({
	title,
	description,
	icon,
}: {
	title: string;
	description: string;
	icon: React.ReactNode;
}) {
	return (
		<div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
			<div className="flex items-start gap-4">
				<div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
					{icon}
				</div>
				<div className="flex-1 min-w-0">
					<h3 className="font-semibold text-slate-900 mb-1">{title}</h3>
					<p className="text-sm text-slate-500 mb-4">{description}</p>
					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
						<span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
						Coming soon
					</span>
				</div>
			</div>
		</div>
	);
}

export default function AdminPage() {
	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
				<h1 className="text-lg font-semibold text-slate-900">Admin</h1>
				<p className="text-sm text-slate-500 mt-0.5">
					Manage data sources and review usage analytics
				</p>
			</div>

			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto space-y-8">
					{/* Data Sources section */}
					<section>
						<div className="flex items-center justify-between mb-4">
							<div>
								<h2 className="text-base font-semibold text-slate-900">
									Data Sources
								</h2>
								<p className="text-sm text-slate-500 mt-0.5">
									Connect and manage the knowledge sources ingested into Company
									Brain.
								</p>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<SectionCard
								title="Google Drive"
								description="Sync documents and files from your Google Drive workspace."
								icon={
									<svg
										className="w-5 h-5"
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
								}
							/>
							<SectionCard
								title="Notion"
								description="Import pages and databases from your Notion workspace."
								icon={
									<svg
										className="w-5 h-5"
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
								}
							/>
							<SectionCard
								title="Confluence"
								description="Index your Confluence spaces and pages automatically."
								icon={
									<svg
										className="w-5 h-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.75}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
										/>
									</svg>
								}
							/>
							<SectionCard
								title="Slack"
								description="Connect Slack channels to include conversations in search."
								icon={
									<svg
										className="w-5 h-5"
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
								}
							/>
						</div>
					</section>

					{/* Usage Analytics section */}
					<section>
						<div className="mb-4">
							<h2 className="text-base font-semibold text-slate-900">
								Usage Analytics
							</h2>
							<p className="text-sm text-slate-500 mt-0.5">
								Monitor search queries, chat usage, and knowledge gaps.
							</p>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<SectionCard
								title="Query Analytics"
								description="See the most common questions users ask and identify knowledge gaps."
								icon={
									<svg
										className="w-5 h-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.75}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
										/>
									</svg>
								}
							/>
							<SectionCard
								title="User Activity"
								description="Track active users, session lengths, and feature adoption rates."
								icon={
									<svg
										className="w-5 h-5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={1.75}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
										/>
									</svg>
								}
							/>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
