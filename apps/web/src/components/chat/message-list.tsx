"use client";

import type { Message } from "@/types";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function SourceCard({
	title,
	url,
	snippet,
	updatedAt,
}: {
	title: string;
	url: string;
	snippet: string;
	updatedAt: string;
}) {
	const formattedDate = new Date(updatedAt).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<a
			href={url}
			className="group flex flex-col gap-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-2.5 text-left hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
		>
			<span className="text-xs font-medium text-stone-700 dark:text-stone-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 line-clamp-1">
				{title}
			</span>
			<span className="text-xs text-stone-500 dark:text-stone-400 line-clamp-2">{snippet}</span>
			<span className="text-xs text-stone-400 dark:text-stone-500">{formattedDate}</span>
		</a>
	);
}

function AssistantIcon() {
	return (
		<div className="shrink-0 w-8 h-8 rounded-full bg-indigo-700 flex items-center justify-center shadow-sm">
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
		<div className="shrink-0 w-8 h-8 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center">
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
		</div>
	);
}

function TypingIndicator() {
	return (
		<div className="flex gap-3">
			<AssistantIcon />
			<div className="flex items-center gap-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
					style={{ animationDelay: "0ms" }}
				/>
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
					style={{ animationDelay: "150ms" }}
				/>
				<span
					className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
					style={{ animationDelay: "300ms" }}
				/>
			</div>
		</div>
	);
}

function MarkdownContent({ content }: { content: string }) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
				strong: ({ children }) => (
					<strong className="font-semibold">{children}</strong>
				),
				ul: ({ children }) => (
					<ul className="mb-2 last:mb-0 ml-4 list-disc space-y-1">
						{children}
					</ul>
				),
				ol: ({ children }) => (
					<ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-1">
						{children}
					</ol>
				),
				li: ({ children }) => <li>{children}</li>,
				h1: ({ children }) => (
					<h1 className="text-base font-bold mb-2 mt-3 first:mt-0">
						{children}
					</h1>
				),
				h2: ({ children }) => (
					<h2 className="text-sm font-bold mb-1.5 mt-2.5 first:mt-0">
						{children}
					</h2>
				),
				h3: ({ children }) => (
					<h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">
						{children}
					</h3>
				),
				code: ({ className, children, ...props }) => {
					const isBlock = className?.includes("language-");
					if (isBlock) {
						return (
							<code
								className="block bg-stone-100 dark:bg-stone-900 rounded-lg px-3 py-2 my-2 text-xs font-mono overflow-x-auto whitespace-pre"
								{...props}
							>
								{children}
							</code>
						);
					}
					return (
						<code
							className="bg-stone-100 dark:bg-stone-900 rounded px-1.5 py-0.5 text-xs font-mono"
							{...props}
						>
							{children}
						</code>
					);
				},
				pre: ({ children }) => (
					<div className="my-2 last:mb-0">{children}</div>
				),
				blockquote: ({ children }) => (
					<blockquote className="border-l-2 border-indigo-300 dark:border-indigo-600 pl-3 my-2 text-stone-600 dark:text-stone-400 italic">
						{children}
					</blockquote>
				),
				a: ({ href, children }) => (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-indigo-600 dark:text-indigo-400 hover:underline"
					>
						{children}
					</a>
				),
				table: ({ children }) => (
					<div className="overflow-x-auto my-2">
						<table className="min-w-full text-xs border-collapse">
							{children}
						</table>
					</div>
				),
				th: ({ children }) => (
					<th className="border border-stone-300 dark:border-stone-600 bg-stone-100 dark:bg-stone-900 px-2 py-1 text-left font-semibold">
						{children}
					</th>
				),
				td: ({ children }) => (
					<td className="border border-stone-300 dark:border-stone-600 px-2 py-1">
						{children}
					</td>
				),
			}}
		>
			{content}
		</ReactMarkdown>
	);
}

function ChatMessage({ message }: { message: Message }) {
	const t = useTranslations("chat");
	const isUser = message.role === "user";

	return (
		<div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
			{isUser ? <UserIcon /> : <AssistantIcon />}

			<div
				className={`flex flex-col gap-2 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}
			>
				{/* Bubble */}
				<div
					className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
						isUser
							? "bg-indigo-700 text-white rounded-tr-sm shadow-sm shadow-indigo-500/20"
							: "bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 rounded-tl-sm shadow-sm"
					}`}
				>
					{isUser ? (
						message.content
					) : (
						<MarkdownContent content={message.content} />
					)}
				</div>

				{/* Sources */}
				{!isUser && message.sources && message.sources.length > 0 && (
					<div className="w-full">
						<p className="text-xs text-stone-400 dark:text-stone-500 mb-1.5 ml-0.5">
							{t("sources")}
						</p>
						<div className="grid gap-2">
							{message.sources.map((source) => (
								<SourceCard key={source.url} {...source} />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

interface MessageListProps {
	messages: Message[];
	isStreaming?: boolean;
}

export function MessageList({
	messages,
	isStreaming = false,
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

	return (
		<div className="chat-scroll h-full overflow-y-auto">
			<div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
				{messages.map((message) => (
					<ChatMessage key={message.id} message={message} />
				))}
				{showTypingIndicator && <TypingIndicator />}
				<div ref={bottomRef} />
			</div>
		</div>
	);
}
