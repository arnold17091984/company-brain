"use client";

import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import type { Message, Source } from "@/types";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

// ─── Source type icons ────────────────────────────────────────────────────────

const SOURCE_TYPE_ICONS: Record<string, string> = {
	google_drive: "G",
	notion: "N",
	telegram: "T",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceTypeIcon({ sourceType }: { sourceType?: string }) {
	if (!sourceType) return null;
	const letter = SOURCE_TYPE_ICONS[sourceType] ?? sourceType[0]?.toUpperCase();
	return (
		<span className="shrink-0 w-5 h-5 rounded bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">
			{letter}
		</span>
	);
}

function SourceCard({ source, index }: { source: Source; index: number }) {
	const formattedDate = new Date(source.updatedAt).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<a
			href={source.url}
			target="_blank"
			rel="noopener noreferrer"
			className="card-glow group flex flex-col gap-1 rounded-xl border border-zinc-200/80 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#1a1a1f] px-3 py-2.5 text-left hover:border-indigo-300 dark:hover:border-indigo-400/30 transition-[border-color,box-shadow] duration-150"
		>
			<span className="flex items-center gap-1.5">
				{/* Inline citation number */}
				<span className="shrink-0 w-4 h-4 rounded-sm bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold flex items-center justify-center">
					{index + 1}
				</span>
				<SourceTypeIcon sourceType={source.sourceType} />
				<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 line-clamp-1">
					{source.title}
				</span>
				{source.score !== undefined && (
					<span className="ml-auto shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
						{Math.round(source.score * 100)}%
					</span>
				)}
			</span>
			<span className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
				{source.snippet}
			</span>
			<span className="text-xs text-zinc-400 dark:text-zinc-500">
				{formattedDate}
			</span>
		</a>
	);
}

function AssistantIcon() {
	return (
		<div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/25 ring-1 ring-white/[0.12]">
			<svg
				className="w-4 h-4 text-amber-300"
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
		</div>
	);
}

function UserIcon() {
	return (
		<div className="shrink-0 w-8 h-8 rounded-full bg-zinc-200 dark:bg-white/[0.08] flex items-center justify-center ring-1 ring-zinc-300/80 dark:ring-white/[0.08]">
			<svg
				className="w-4 h-4 text-zinc-500 dark:text-zinc-400"
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
		</div>
	);
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
	return (
		<div className="flex gap-3 animate-fade-in">
			<AssistantIcon />
			<div className="flex items-center gap-1.5 bg-white dark:bg-[#1a1a1f] border border-zinc-200/80 dark:border-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3">
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-[pulse_1.2s_ease-in-out_0ms_infinite]"
					aria-hidden="true"
				/>
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-[pulse_1.2s_ease-in-out_300ms_infinite]"
					aria-hidden="true"
				/>
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-[pulse_1.2s_ease-in-out_600ms_infinite]"
					aria-hidden="true"
				/>
				<span className="sr-only">Thinking…</span>
			</div>
		</div>
	);
}

// ─── Thinking accordion ───────────────────────────────────────────────────────

function ThinkingAccordion({ thinking }: { thinking: string }) {
	const [isOpen, setIsOpen] = useState(false);
	const t = useTranslations("chat");

	return (
		<div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.06] bg-zinc-50 dark:bg-[#1a1a1f]/50 overflow-hidden">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-[color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
			>
				<svg
					className={`w-3 h-3 transition-transform ${isOpen ? "rotate-90" : ""}`}
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
				{t("thinkingProcess")}
			</button>
			{isOpen && (
				<div className="px-3 pb-3 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed border-t border-zinc-200/80 dark:border-white/[0.06] pt-2">
					<MarkdownRenderer content={thinking} />
				</div>
			)}
		</div>
	);
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
	const t = useTranslations("chat");
	const pct = Math.round(score * 100);
	let colorClass: string;
	if (pct >= 80) {
		colorClass = "text-green-600 dark:text-green-400";
	} else if (pct >= 50) {
		colorClass = "text-amber-600 dark:text-amber-400";
	} else {
		colorClass = "text-red-500 dark:text-red-400";
	}
	return (
		<span className={`text-xs font-medium ${colorClass}`}>
			{t("confidence")}: {pct}%
		</span>
	);
}

// ─── Sources section with collapsible list ────────────────────────────────────

function SourcesSection({ sources }: { sources: Source[] }) {
	const [expanded, setExpanded] = useState(false);
	const t = useTranslations("chat");
	const visibleSources = expanded ? sources : sources.slice(0, 2);

	return (
		<div className="w-full">
			{/* Inline citation chips */}
			<div className="flex flex-wrap items-center gap-1.5 mb-2">
				<span className="text-xs text-zinc-400 dark:text-zinc-500">
					{t("sources")}
				</span>
				{sources.map((s, i) => (
					<a
						key={s.url}
						href={s.url}
						target="_blank"
						rel="noopener noreferrer"
						title={s.title}
						className="inline-flex items-center justify-center w-5 h-5 rounded-sm bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[9px] font-bold hover:bg-indigo-500/20 dark:hover:bg-indigo-500/25 transition-colors"
					>
						{i + 1}
					</a>
				))}
			</div>

			{/* Source cards */}
			<div className="grid gap-2">
				{visibleSources.map((s, i) => (
					<SourceCard key={s.url} source={s} index={i} />
				))}
			</div>

			{/* Toggle button when more than 2 sources */}
			{sources.length > 2 && (
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="mt-2 text-xs font-medium text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
				>
					{expanded
						? "Show fewer sources"
						: `Show ${sources.length - 2} more sources`}
				</button>
			)}
		</div>
	);
}

// ─── Message action bar ───────────────────────────────────────────────────────

interface ActionBarProps {
	message: Message;
	onRegenerate: () => void;
	onFeedback: (rating: "up" | "down") => void;
}

function MessageActionBar({
	message,
	onRegenerate,
	onFeedback,
}: ActionBarProps) {
	const t = useTranslations("chat");
	const [copied, setCopied] = useState(false);
	const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(message.content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard unavailable — fail silently
		}
	}, [message.content]);

	function handleFeedback(rating: "up" | "down") {
		setFeedback(rating);
		onFeedback(rating);
	}

	const btnBase =
		"flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 text-zinc-400 dark:text-zinc-500 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
	const btnHover =
		"hover:bg-zinc-100 dark:hover:bg-white/[0.07] hover:text-zinc-600 dark:hover:text-zinc-300";

	return (
		<div className="flex items-center gap-0.5 animate-fade-in">
			{/* Copy */}
			<button
				type="button"
				onClick={handleCopy}
				aria-label={t("copyMessage")}
				title={t("copyMessage")}
				className={`${btnBase} ${btnHover} ${copied ? "text-emerald-500 dark:text-emerald-400" : ""}`}
			>
				{copied ? (
					<svg
						className="w-3.5 h-3.5"
						viewBox="0 0 24 24"
						fill="none"
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
				) : (
					<svg
						className="w-3.5 h-3.5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.75}
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
						/>
					</svg>
				)}
			</button>

			{/* Regenerate */}
			<button
				type="button"
				onClick={onRegenerate}
				aria-label={t("regenerate")}
				title={t("regenerate")}
				className={`${btnBase} ${btnHover}`}
			>
				<svg
					className="w-3.5 h-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
					/>
				</svg>
			</button>

			{/* Divider */}
			<span
				className="w-px h-4 bg-zinc-200 dark:bg-white/[0.08] mx-0.5"
				aria-hidden="true"
			/>

			{/* Thumbs up */}
			<button
				type="button"
				onClick={() => handleFeedback("up")}
				aria-label={t("thumbsUp")}
				title={t("thumbsUp")}
				className={`${btnBase} ${btnHover} ${feedback === "up" ? "text-green-500 dark:text-green-400 bg-green-50 dark:bg-green-500/10" : ""}`}
			>
				<svg
					className="w-3.5 h-3.5"
					viewBox="0 0 24 24"
					fill={feedback === "up" ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.203 4.167 9.75 5 9.75h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z"
					/>
				</svg>
			</button>

			{/* Thumbs down */}
			<button
				type="button"
				onClick={() => handleFeedback("down")}
				aria-label={t("thumbsDown")}
				title={t("thumbsDown")}
				className={`${btnBase} ${btnHover} ${feedback === "down" ? "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10" : ""}`}
			>
				<svg
					className="w-3.5 h-3.5"
					viewBox="0 0 24 24"
					fill={feedback === "down" ? "currentColor" : "none"}
					stroke="currentColor"
					strokeWidth={1.75}
					aria-hidden="true"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15h3.126c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
					/>
				</svg>
			</button>
		</div>
	);
}

// ─── Chat message ─────────────────────────────────────────────────────────────

interface ChatMessageProps {
	message: Message;
	onRegenerate: () => void;
	onFeedback: (messageId: string, rating: "up" | "down") => void;
	isLast: boolean;
	index: number;
}

function ChatMessage({
	message,
	onRegenerate,
	onFeedback,
	isLast,
	index,
}: ChatMessageProps) {
	const isUser = message.role === "user";
	const [hovered, setHovered] = useState(false);

	return (
		<div
			className={`flex gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : "flex-row"}`}
			style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{isUser ? <UserIcon /> : <AssistantIcon />}

			<div
				className={`relative flex flex-col gap-2 min-w-0 ${
					isUser ? "items-end max-w-[75%]" : "items-start flex-1"
				}`}
			>
				{/* Thinking accordion (assistant only) */}
				{!isUser && message.thinking && (
					<div className="w-full">
						<ThinkingAccordion thinking={message.thinking} />
					</div>
				)}

				{/* Message bubble */}
				<div
					className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
						isUser
							? "bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-tr-sm shadow-md shadow-indigo-500/25"
							: "bg-white dark:bg-[#1a1a1f] border border-zinc-200/80 dark:border-white/[0.06] text-zinc-800 dark:text-[#ececf1] rounded-tl-sm w-full"
					}`}
				>
					{isUser ? (
						message.content
					) : (
						<MarkdownRenderer content={message.content} />
					)}
				</div>

				{/* Action bar — visible on hover for completed assistant messages */}
				{!isUser && message.content.length > 0 && (
					<div
						className={`transition-opacity duration-150 ${hovered || isLast ? "opacity-100" : "opacity-0"}`}
					>
						<MessageActionBar
							message={message}
							onRegenerate={onRegenerate}
							onFeedback={(rating) => onFeedback(message.id, rating)}
						/>
					</div>
				)}

				{/* Confidence badge */}
				{!isUser && message.confidence !== undefined && (
					<ConfidenceBadge score={message.confidence} />
				)}

				{/* Sources with inline citations */}
				{!isUser && message.sources && message.sources.length > 0 && (
					<SourcesSection sources={message.sources} />
				)}
			</div>
		</div>
	);
}

// ─── MessageList ──────────────────────────────────────────────────────────────

interface MessageListProps {
	messages: Message[];
	isStreaming?: boolean;
	onRegenerate?: () => void;
	onFeedback?: (messageId: string, rating: "up" | "down") => void;
}

export function MessageList({
	messages,
	isStreaming = false,
	onRegenerate,
	onFeedback,
}: MessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const lastAssistant =
		messages.length > 0 ? messages[messages.length - 1] : null;
	const showTypingIndicator =
		isStreaming &&
		lastAssistant?.role === "assistant" &&
		lastAssistant.content === "";

	// Auto-scroll to bottom when new messages arrive or content streams in
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages and isStreaming are intentional scroll triggers
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isStreaming]);

	const handleRegenerate = useCallback(() => {
		onRegenerate?.();
	}, [onRegenerate]);

	const handleFeedback = useCallback(
		(messageId: string, rating: "up" | "down") => {
			onFeedback?.(messageId, rating);
		},
		[onFeedback],
	);

	return (
		<div className="chat-scroll h-full overflow-y-auto">
			<div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
				{messages.map((message, index) => (
					<ChatMessage
						key={message.id}
						message={message}
						onRegenerate={handleRegenerate}
						onFeedback={handleFeedback}
						isLast={index === messages.length - 1}
						index={index}
					/>
				))}
				{showTypingIndicator && <TypingIndicator />}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
