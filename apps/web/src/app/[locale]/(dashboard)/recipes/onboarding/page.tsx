"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface OnboardingRecipe {
	id: string;
	title: string;
	description: string;
	prompt_template: string;
	example_query: string;
	example_response: string;
	effectiveness_score: number;
	department: string;
}

interface OnboardingResponse {
	department: string;
	recipes: OnboardingRecipe[];
}

function SkeletonStep() {
	return (
		<div className="flex gap-5 animate-pulse">
			<div className="shrink-0 w-9 h-9 rounded-full bg-stone-200 dark:bg-stone-700 mt-0.5" />
			<div className="flex-1 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 p-5 space-y-3">
				<div className="h-4 w-48 bg-stone-200 dark:bg-stone-700 rounded" />
				<div className="h-3 w-full bg-stone-100 dark:bg-stone-600 rounded" />
				<div className="h-20 w-full bg-stone-100 dark:bg-stone-600 rounded-lg" />
			</div>
		</div>
	);
}

function RecipeStep({
	recipe,
	stepNumber,
}: {
	recipe: OnboardingRecipe;
	stepNumber: number;
}) {
	const t = useTranslations("recipes");
	const [promptCopied, setPromptCopied] = useState(false);
	const [queryCopied, setQueryCopied] = useState(false);

	const handleCopy = async (text: string, setter: (v: boolean) => void) => {
		try {
			await navigator.clipboard.writeText(text);
			setter(true);
			setTimeout(() => setter(false), 2000);
		} catch {
			// silent
		}
	};

	return (
		<div className="flex gap-5">
			{/* Step number circle */}
			<div className="shrink-0 flex flex-col items-center">
				<div className="w-9 h-9 rounded-full bg-indigo-600 dark:bg-indigo-700 text-white flex items-center justify-center text-sm font-bold shadow-sm">
					{stepNumber}
				</div>
				{/* Connector line (hidden on last item via CSS) */}
				<div className="w-px flex-1 bg-stone-200 dark:bg-stone-700 mt-2 min-h-[1rem]" />
			</div>

			{/* Card */}
			<div className="flex-1 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm p-5 mb-5 space-y-4">
				<div>
					<h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-1">
						{recipe.title}
					</h3>
					{recipe.description && (
						<p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
							{recipe.description}
						</p>
					)}
				</div>

				{/* Prompt template */}
				<div>
					<div className="flex items-center justify-between mb-2">
						<span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
							{t("promptTemplate")}
						</span>
						<button
							type="button"
							onClick={() =>
								handleCopy(recipe.prompt_template, setPromptCopied)
							}
							className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-stone-500 hover:bg-stone-100 transition-colors dark:text-stone-400 dark:hover:bg-stone-700"
						>
							{promptCopied ? (
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
									{t("copied")}
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
									{t("copyPrompt")}
								</>
							)}
						</button>
					</div>
					<pre className="text-xs font-mono text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-900/40 rounded-lg p-3 whitespace-pre-wrap break-words leading-relaxed border border-stone-100 dark:border-stone-700">
						{recipe.prompt_template}
					</pre>
				</div>

				{/* Example Q&A */}
				{(recipe.example_query || recipe.example_response) && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						{recipe.example_query && (
							<div>
								<div className="flex items-center justify-between mb-1.5">
									<span className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
										{t("exampleQuery")}
									</span>
									<button
										type="button"
										onClick={() =>
											handleCopy(recipe.example_query, setQueryCopied)
										}
										className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
									>
										{queryCopied ? t("copied") : t("copy")}
									</button>
								</div>
								<div className="text-xs text-stone-600 dark:text-stone-400 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900 leading-relaxed">
									{recipe.example_query}
								</div>
							</div>
						)}
						{recipe.example_response && (
							<div>
								<p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
									{t("exampleResponse")}
								</p>
								<div className="text-xs text-stone-600 dark:text-stone-400 bg-green-50/50 dark:bg-green-950/20 rounded-lg p-3 border border-green-100 dark:border-green-900 leading-relaxed">
									{recipe.example_response}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

export default function RecipesOnboardingPage() {
	const { data: session } = useSession();
	const t = useTranslations("recipes");

	const [data, setData] = useState<OnboardingResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const getToken = useCallback(() => {
		return (
			(session as { accessToken?: string } | null)?.accessToken ?? "dev-token"
		);
	}, [session]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);
			try {
				const res = await fetch(`${API_BASE_URL}/api/v1/recipes/onboarding`, {
					headers: { Authorization: `Bearer ${getToken()}` },
				});
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				const json: OnboardingResponse = await res.json();
				if (!cancelled) setData(json);
			} catch (err) {
				if (!cancelled)
					setError(
						err instanceof Error
							? err.message
							: "Failed to load onboarding recipes",
					);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [getToken]);

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="border-b border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4 shrink-0">
				<div className="flex items-center gap-3 mb-0.5">
					<Link
						href="../recipes"
						className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
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
						{t("backToRecipes")}
					</Link>
					<span className="text-stone-300 dark:text-stone-600">/</span>
					<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
						{t("onboardingTitle")}
					</h1>
				</div>
				{data?.department && (
					<p className="text-sm text-stone-500 dark:text-stone-400">
						{t("onboardingSubtitle", {
							department: data.department.replace("_", " "),
						})}
					</p>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="max-w-3xl mx-auto">
					{error && (
						<div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mb-6">
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

					{/* Intro banner */}
					{!isLoading && !error && (
						<div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5 mb-6">
							<div className="flex items-start gap-3">
								<div className="w-8 h-8 rounded-lg bg-indigo-600 dark:bg-indigo-700 flex items-center justify-center shrink-0">
									<svg
										className="w-4 h-4 text-white"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										strokeWidth={2}
										aria-hidden="true"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
										/>
									</svg>
								</div>
								<div>
									<p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-1">
										{t("onboardingIntroTitle")}
									</p>
									<p className="text-xs text-indigo-600 dark:text-indigo-400 leading-relaxed">
										{t("onboardingIntroDesc")}
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Steps */}
					{isLoading ? (
						<div className="space-y-2">
							{Array.from({ length: 4 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: skeleton items
								<SkeletonStep key={i} />
							))}
						</div>
					) : data && data.recipes.length > 0 ? (
						<div>
							{data.recipes.map((recipe, idx) => (
								<RecipeStep
									key={recipe.id}
									recipe={recipe}
									stepNumber={idx + 1}
								/>
							))}

							{/* Completion card */}
							<div className="flex gap-5 mt-2">
								<div className="shrink-0 w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center shadow-sm">
									<svg
										className="w-4 h-4"
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
								</div>
								<div className="flex-1 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800 p-5 mb-5">
									<p className="text-sm font-semibold text-green-800 dark:text-green-200 mb-1">
										{t("onboardingComplete")}
									</p>
									<p className="text-xs text-green-600 dark:text-green-400 leading-relaxed mb-3">
										{t("onboardingCompleteDesc")}
									</p>
									<Link
										href="../recipes"
										className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
									>
										{t("exploreAllRecipes")}
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
												d="M8.25 4.5l7.5 7.5-7.5 7.5"
											/>
										</svg>
									</Link>
								</div>
							</div>
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-20 text-center">
							<div className="w-16 h-16 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-4">
								<svg
									className="w-8 h-8 text-stone-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={1.5}
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
									/>
								</svg>
							</div>
							<p className="text-stone-700 dark:text-stone-200 font-medium">
								{t("noOnboardingRecipes")}
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
