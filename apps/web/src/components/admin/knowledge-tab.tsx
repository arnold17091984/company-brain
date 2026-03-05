"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ---- Types ----------------------------------------------------------------

interface PromotableQA {
	message_id: string;
	question: string;
	answer: string;
	upvote_count: number;
	session_id: string;
	user_email: string;
	created_at: string;
	already_promoted: boolean;
}

// ---- KnowledgeTab ---------------------------------------------------------

export function KnowledgeTab({
	getAccessToken,
}: {
	getAccessToken: () => string;
}) {
	const t = useTranslations("admin");
	const [items, setItems] = useState<PromotableQA[]>([]);
	const [loading, setLoading] = useState(true);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [promoting, setPromoting] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const pageSize = 20;

	const fetchItems = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/knowledge/promotable?page=${page}&page_size=${pageSize}`,
				{ headers: { Authorization: `Bearer ${getAccessToken()}` } },
			);
			if (res.ok) {
				const data = await res.json();
				setItems(data.items);
				setTotal(data.total);
			}
		} finally {
			setLoading(false);
		}
	}, [getAccessToken, page]);

	useEffect(() => {
		fetchItems();
	}, [fetchItems]);

	const handlePromote = async (item: PromotableQA) => {
		setPromoting(item.message_id);
		setSuccess(null);
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/admin/knowledge/promote`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${getAccessToken()}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						message_id: item.message_id,
						title: `Q&A: ${item.question.slice(0, 80)}`,
						category: "general",
						access_level: "all",
					}),
				},
			);
			if (res.ok) {
				setSuccess(item.message_id);
				await fetchItems();
			}
		} finally {
			setPromoting(null);
		}
	};

	const totalPages = Math.ceil(total / pageSize);

	return (
		<div className="animate-fade-in">
			<h2 className="text-base font-medium text-zinc-900 dark:text-zinc-100">
				{t("knowledgeTitle")}
			</h2>
			<p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5 mb-4">
				{t("knowledgeSub")}
			</p>

			{loading ? (
				<div className="space-y-3 py-4">
					{[0, 1, 2, 3, 4].map((i) => (
						<div
							key={i}
							className="flex gap-4 py-2 border-b border-zinc-100 dark:border-white/[0.04]"
						>
							<Skeleton height="1rem" width="40%" />
							<Skeleton height="1rem" width="30%" />
							<Skeleton height="1rem" width="10%" />
							<Skeleton height="1rem" width="10%" />
						</div>
					))}
				</div>
			) : items.length === 0 ? (
				<p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
					{t("knowledgeEmpty")}
				</p>
			) : (
				<>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-zinc-200/60 dark:border-white/[0.04] text-left text-zinc-500 dark:text-zinc-400">
									<th className="pb-2 font-medium">{t("knowledgeQuestion")}</th>
									<th className="pb-2 font-medium">{t("knowledgeAnswer")}</th>
									<th className="pb-2 font-medium text-center">
										{t("knowledgeUpvotes")}
									</th>
									<th className="pb-2 font-medium text-center">
										{t("actions")}
									</th>
								</tr>
							</thead>
							<tbody>
								{items.map((item) => (
									<tr
										key={item.message_id}
										className="border-b border-zinc-100 dark:border-white/[0.04]"
									>
										<td className="py-3 pr-3 max-w-[240px]">
											<p className="text-zinc-900 dark:text-zinc-100 truncate">
												{item.question}
											</p>
											<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
												{item.user_email}
											</p>
										</td>
										<td className="py-3 pr-3 max-w-[300px]">
											<p className="text-zinc-700 dark:text-zinc-300 line-clamp-2 text-xs">
												{item.answer}
											</p>
										</td>
										<td className="py-3 text-center">
											<span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
												<svg
													className="w-4 h-4"
													fill="currentColor"
													viewBox="0 0 20 20"
													aria-hidden="true"
												>
													<path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
												</svg>
												{item.upvote_count}
											</span>
										</td>
										<td className="py-3 text-center">
											{item.already_promoted ? (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium">
													{t("knowledgePromoted")}
												</span>
											) : (
												<button
													type="button"
													onClick={() => handlePromote(item)}
													disabled={promoting === item.message_id}
													className="min-h-[44px] px-3 py-1 text-xs font-medium rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white hover:brightness-110 disabled:opacity-50 transition-[filter,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none shadow-sm shadow-indigo-500/25"
												>
													{promoting === item.message_id
														? "..."
														: t("knowledgePromote")}
												</button>
											)}
											{success === item.message_id && (
												<p className="text-xs text-green-600 dark:text-green-400 mt-1">
													{t("knowledgePromoteSuccess")}
												</p>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{totalPages > 1 && (
						<div className="flex justify-center gap-2 mt-4">
							<button
								type="button"
								onClick={() => setPage((p) => Math.max(1, p - 1))}
								disabled={page === 1}
								className="min-h-[44px] px-3 py-1 text-sm rounded-xl border border-zinc-300 dark:border-white/[0.08] disabled:opacity-40"
							>
								&laquo;
							</button>
							<span className="px-3 py-1 text-sm text-zinc-600 dark:text-zinc-400">
								{page} / {totalPages}
							</span>
							<button
								type="button"
								onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
								disabled={page === totalPages}
								className="min-h-[44px] px-3 py-1 text-sm rounded-xl border border-zinc-300 dark:border-white/[0.08] disabled:opacity-40"
							>
								&raquo;
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
