"use client";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { useChat } from "@/hooks/use-chat";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export default function ChatPage() {
	const {
		messages,
		sendMessage,
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

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-stone-200/60 bg-white/80 dark:bg-stone-900/80 dark:border-stone-700/60 backdrop-blur-sm px-6 py-4 shrink-0 flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
						{t("pageTitle")}
					</h1>
					<p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
						{t("subtitle")}
					</p>
				</div>
				{messages.length > 0 && (
					<button
						type="button"
						onClick={startNewChat}
						className="text-xs text-stone-400 hover:text-stone-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-100 dark:text-stone-500 dark:hover:text-stone-300 dark:hover:bg-stone-800"
					>
						{t("newChat")}
					</button>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<div className="shrink-0 bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-800 px-6 py-3 flex items-center gap-2">
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
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-center px-6 animate-fade-in">
						<div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center mb-4">
							<svg
								className="w-8 h-8 text-amber-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={1.5}
								aria-hidden="true"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
								/>
							</svg>
						</div>
						<p className="text-stone-700 dark:text-stone-200 font-medium">
							{t("emptyTitle")}
						</p>
						<p className="text-stone-400 dark:text-stone-500 text-sm mt-1 max-w-md">
							{t("emptySubtitle")}
						</p>

						{/* Suggestion cards */}
						<div className="grid grid-cols-2 gap-3 mt-8 w-full max-w-md">
							<button
								type="button"
								className="text-left p-3 rounded-xl border border-stone-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors group dark:border-stone-700 dark:bg-stone-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
							>
								<p className="text-xs font-medium text-stone-600 group-hover:text-indigo-700 dark:text-stone-300 dark:group-hover:text-indigo-300">
									{t("suggestEmail")}
								</p>
								<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
									{t("suggestEmailDesc")}
								</p>
							</button>
							<button
								type="button"
								className="text-left p-3 rounded-xl border border-stone-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors group dark:border-stone-700 dark:bg-stone-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
							>
								<p className="text-xs font-medium text-stone-600 group-hover:text-indigo-700 dark:text-stone-300 dark:group-hover:text-indigo-300">
									{t("suggestPolicy")}
								</p>
								<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
									{t("suggestPolicyDesc")}
								</p>
							</button>
							<button
								type="button"
								className="text-left p-3 rounded-xl border border-stone-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors group dark:border-stone-700 dark:bg-stone-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
							>
								<p className="text-xs font-medium text-stone-600 group-hover:text-indigo-700 dark:text-stone-300 dark:group-hover:text-indigo-300">
									{t("suggestTranslate")}
								</p>
								<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
									{t("suggestTranslateDesc")}
								</p>
							</button>
							<button
								type="button"
								className="text-left p-3 rounded-xl border border-stone-200 bg-white hover:border-indigo-300 hover:bg-indigo-50 transition-colors group dark:border-stone-700 dark:bg-stone-800 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/40"
							>
								<p className="text-xs font-medium text-stone-600 group-hover:text-indigo-700 dark:text-stone-300 dark:group-hover:text-indigo-300">
									{t("suggestCode")}
								</p>
								<p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
									{t("suggestCodeDesc")}
								</p>
							</button>
						</div>
					</div>
				) : (
					<MessageList messages={messages} isStreaming={isLoading} />
				)}
			</div>

			{/* Input */}
			<div className="shrink-0 border-t border-stone-200/60 dark:border-stone-700/60 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm px-6 py-4">
				<MessageInput onSend={sendMessage} disabled={isLoading} />
			</div>
		</div>
	);
}
