"use client";

import { getAccessToken } from "@/lib/session";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Template {
	id: string;
	title: string;
	description: string;
	content: string;
	category: string;
	vote_count: number;
	copy_count: number;
	author_name: string;
	user_id: string;
	created_at: string;
	updated_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
	cs: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
	marketing:
		"bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800",
	development:
		"bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
	accounting:
		"bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
	general_affairs:
		"bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

export default function TemplateDetailPage({
	params,
}: { params: { id: string; locale: string } }) {
	const { data: session } = useSession();
	const t = useTranslations("templates");
	const router = useRouter();

	const [template, setTemplate] = useState<Template | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [voted, setVoted] = useState(false);
	const [copied, setCopied] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [contentCopied, setContentCopied] = useState(false);

	const currentUserId =
		(session?.user as { id?: string } | undefined)?.id ?? "";

	const getToken = useCallback(() => {
		return getAccessToken(session);
	}, [session]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);
			try {
				const res = await fetch(
					`${API_BASE_URL}/api/v1/templates/${params.id}`,
					{
						headers: { Authorization: `Bearer ${getToken()}` },
					},
				);
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const data: Template = await res.json();
				if (!cancelled) setTemplate(data);
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error ? err.message : "Failed to load template",
					);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [params.id, getToken]);

	const handleVote = async () => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/templates/${params.id}/vote`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${getToken()}` },
				},
			);
			if (!res.ok) return;
			setVoted((v) => !v);
			setTemplate((prev) =>
				prev
					? {
							...prev,
							vote_count: voted ? prev.vote_count - 1 : prev.vote_count + 1,
						}
					: prev,
			);
		} catch {
			// silent
		}
	};

	const handleCopy = async () => {
		try {
			const res = await fetch(
				`${API_BASE_URL}/api/v1/templates/${params.id}/copy`,
				{
					method: "POST",
					headers: { Authorization: `Bearer ${getToken()}` },
				},
			);
			if (!res.ok) return;
			setCopied(true);
			setTemplate((prev) =>
				prev ? { ...prev, copy_count: prev.copy_count + 1 } : prev,
			);
		} catch {
			// silent
		}
	};

	const handleDelete = async () => {
		if (!window.confirm(t("deleteConfirm"))) return;
		setIsDeleting(true);
		try {
			const res = await fetch(`${API_BASE_URL}/api/v1/templates/${params.id}`, {
				method: "DELETE",
				headers: { Authorization: `Bearer ${getToken()}` },
			});
			if (!res.ok) throw new Error(`${res.status}`);
			router.push("../templates");
		} catch {
			setIsDeleting(false);
		}
	};

	const handleCopyContent = async () => {
		if (!template?.content) return;
		try {
			await navigator.clipboard.writeText(template.content);
			setContentCopied(true);
			setTimeout(() => setContentCopied(false), 2000);
		} catch {
			// silent
		}
	};

	const isOwner = template ? currentUserId === template.user_id : false;
	const categoryColor = template
		? (CATEGORY_COLORS[template.category] ??
			"bg-zinc-50 text-zinc-600 border-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600")
		: "";

	if (isLoading) {
		return (
			<div className="flex flex-col h-full">
				<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-4 shrink-0">
					<div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-700 rounded animate-pulse" />
				</div>
				<div className="flex-1 overflow-y-auto p-6">
					<div className="max-w-3xl mx-auto space-y-4 animate-pulse">
						<div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-700 rounded" />
						<div className="h-4 w-full bg-zinc-100 dark:bg-zinc-600 rounded" />
						<div className="h-48 w-full bg-zinc-100 dark:bg-zinc-600 rounded-lg" />
					</div>
				</div>
			</div>
		);
	}

	if (error || !template) {
		return (
			<div className="flex flex-col h-full">
				<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-4 shrink-0">
					<Link
						href="../templates"
						className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
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
								d="M15.75 19.5L8.25 12l7.5-7.5"
							/>
						</svg>
						{t("back")}
					</Link>
				</div>
				<div className="flex-1 flex items-center justify-center">
					<p className="text-sm text-red-600 dark:text-red-400">
						{error ?? t("notFound")}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-4 shrink-0">
				<div className="flex items-center justify-between gap-4">
					<Link
						href="../templates"
						className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
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
								d="M15.75 19.5L8.25 12l7.5-7.5"
							/>
						</svg>
						{t("back")}
					</Link>

					{isOwner && (
						<div className="flex items-center gap-2">
							<Link
								href={`../templates/new?edit=${template.id}`}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
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
										d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
									/>
								</svg>
								{t("edit")}
							</Link>
							<button
								type="button"
								onClick={handleDelete}
								disabled={isDeleting}
								className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/60"
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
										d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
									/>
								</svg>
								{isDeleting ? t("deleting") : t("delete")}
							</button>
						</div>
					)}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto space-y-6">
					{/* Title & meta */}
					<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-6">
						<div className="flex items-start justify-between gap-4 mb-3">
							<h1 className="text-xl font-medium text-zinc-900 dark:text-zinc-100 leading-snug">
								{template.title}
							</h1>
							<span
								className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ${categoryColor}`}
							>
								{template.category.replace("_", " ")}
							</span>
						</div>

						{template.description && (
							<p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
								{template.description}
							</p>
						)}

						<div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-700">
							<div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
								<span>
									{t("by")} {template.author_name}
								</span>
								<span>
									{new Date(template.created_at).toLocaleDateString()}
								</span>
							</div>

							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={handleVote}
									className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
										voted
											? "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
											: "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
									}`}
								>
									<svg
										className="w-4 h-4"
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
									{template.vote_count} {t("votes")}
								</button>

								<button
									type="button"
									onClick={handleCopy}
									className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
										copied
											? "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-700"
											: "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 dark:bg-zinc-700 dark:text-zinc-300 dark:border-zinc-600 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
									}`}
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
											d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
										/>
									</svg>
									{template.copy_count} {t("copies")}
								</button>
							</div>
						</div>
					</div>

					{/* Template content */}
					<div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
						<div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 dark:border-zinc-700">
							<span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
								{t("promptContent")}
							</span>
							<button
								type="button"
								onClick={handleCopyContent}
								className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-700"
							>
								{contentCopied ? (
									<>
										<svg
											className="w-3.5 h-3.5 text-green-600 dark:text-green-400"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={2.5}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d="M4.5 12.75l6 6 9-13.5"
											/>
										</svg>
										{t("contentCopied")}
									</>
								) : (
									<>
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
												d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5A3.375 3.375 0 006.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0015 2.25h-1.5a2.251 2.251 0 00-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 00-9-9z"
											/>
										</svg>
										{t("copyContent")}
									</>
								)}
							</button>
						</div>
						<pre className="p-5 text-sm font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-words leading-relaxed overflow-x-auto bg-zinc-50/50 dark:bg-zinc-900/30">
							{template.content}
						</pre>
					</div>
				</div>
			</div>
		</div>
	);
}
