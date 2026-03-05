"use client";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { useChat } from "@/hooks/use-chat";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

// ─── Suggestion card data ─────────────────────────────────────────────────────

const SUGGESTION_ICONS = {
	email:
		"M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
	policy:
		"M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
	translate:
		"M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802",
	code: "M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5",
} as const;

// Animation stagger delays for suggestion cards
const STAGGER_DELAYS = ["0ms", "60ms", "120ms", "180ms"] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChatPage() {
	const {
		messages,
		sendMessage,
		regenerateMessage,
		sendFeedback,
		isLoading,
		error,
		startNewChat,
		sessionId,
		loadSession,
	} = useChat();
	const t = useTranslations("chat");
	const searchParams = useSearchParams();
	const sessionParam = searchParams.get("session");

	// Track which session we've already loaded to avoid re-loading
	const loadedSessionRef = useRef<string | null>(null);

	useEffect(() => {
		if (
			sessionParam &&
			sessionParam !== loadedSessionRef.current &&
			sessionParam !== sessionId
		) {
			loadedSessionRef.current = sessionParam;
			loadSession(sessionParam);
		} else if (!sessionParam && loadedSessionRef.current) {
			// Navigated to /chat without session param — start fresh
			loadedSessionRef.current = null;
			startNewChat();
		}
	}, [sessionParam, sessionId, loadSession, startNewChat]);

	const suggestions = [
		{
			key: "email" as const,
			label: t("suggestEmail"),
			desc: t("suggestEmailDesc"),
			icon: SUGGESTION_ICONS.email,
		},
		{
			key: "policy" as const,
			label: t("suggestPolicy"),
			desc: t("suggestPolicyDesc"),
			icon: SUGGESTION_ICONS.policy,
		},
		{
			key: "translate" as const,
			label: t("suggestTranslate"),
			desc: t("suggestTranslateDesc"),
			icon: SUGGESTION_ICONS.translate,
		},
		{
			key: "code" as const,
			label: t("suggestCode"),
			desc: t("suggestCodeDesc"),
			icon: SUGGESTION_ICONS.code,
		},
	];

	const isEmpty = messages.length === 0;

	return (
		<div className="flex flex-col h-full">
			{/* New chat button — shown only when there are messages, top-right overlay */}
			{!isEmpty && (
				<div className="absolute top-4 right-6 z-10">
					<button
						type="button"
						onClick={startNewChat}
						className="text-xs font-medium text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors duration-150 px-3 py-1.5 rounded-xl border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.04]"
					>
						{t("newChat")}
					</button>
				</div>
			)}

			{/* Error banner */}
			{error && (
				<div className="shrink-0 bg-red-50/80 dark:bg-red-950/60 border-b border-red-200/60 dark:border-red-900/60 px-6 py-3.5 flex items-center gap-2.5 backdrop-blur-sm">
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
					<p className="text-sm text-red-700">{error}</p>
				</div>
			)}

			{/* Messages area */}
			<div className="flex-1 overflow-hidden">
				{isEmpty ? (
					/* ── Empty / hero state ── */
					<div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in bg-hero-glow">
						{/* Hero icon with ambient glow */}
						<div className="relative mb-8">
							<div className="absolute inset-0 w-24 h-24 -translate-x-2 -translate-y-2 rounded-full bg-indigo-500/15 dark:bg-[rgb(124_108_240_/_0.15)] blur-2xl animate-glow-pulse" />
							<div className="relative w-20 h-20 rounded-[20px] bg-gradient-to-br from-indigo-500/15 to-violet-600/15 dark:from-indigo-500/[0.12] dark:to-violet-600/[0.12] border border-indigo-400/20 dark:border-indigo-400/[0.12] flex items-center justify-center animate-float shadow-lg shadow-indigo-500/10 dark:shadow-indigo-500/[0.08]">
								<svg
									className="w-10 h-10 text-indigo-400"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={1.25}
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
									/>
								</svg>
							</div>
						</div>

						<h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">
							{t("emptyTitle")}
						</h2>
						<p className="text-zinc-500 dark:text-zinc-500 text-sm mt-3 max-w-sm leading-relaxed">
							{t("emptySubtitle")}
						</p>

						{/* Suggestion cards — 2×2 grid with stagger animation */}
						<div className="grid grid-cols-2 gap-3 mt-12 w-full max-w-[480px]">
							{suggestions.map((item, idx) => (
								<button
									key={item.key}
									type="button"
									onClick={() => sendMessage(item.desc)}
									style={{ animationDelay: STAGGER_DELAYS[idx] }}
									className="card-glow gradient-border text-left p-5 rounded-2xl border border-zinc-200/80 dark:border-white/[0.06] bg-white dark:bg-[#1a1a1f] hover:bg-zinc-50/80 dark:hover:bg-[#1e1e26] transition-[border-color,background-color,box-shadow,transform] duration-150 group active:scale-[0.98] animate-fade-in"
								>
									<div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/[0.12] flex items-center justify-center mb-4">
										<svg
											className="w-4 h-4 text-indigo-500 dark:text-indigo-400"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											strokeWidth={1.5}
											aria-hidden="true"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												d={item.icon}
											/>
										</svg>
									</div>
									<p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 leading-snug">
										{item.label}
									</p>
									<p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">
										{item.desc}
									</p>
								</button>
							))}
						</div>
					</div>
				) : (
					/* ── Message list ── */
					<MessageList
						messages={messages}
						isStreaming={isLoading}
						onRegenerate={regenerateMessage}
						onFeedback={sendFeedback}
					/>
				)}
			</div>

			{/* Input */}
			<div className="shrink-0 px-8 pt-4 pb-6">
				<MessageInput onSend={sendMessage} disabled={isLoading} />
			</div>
		</div>
	);
}
