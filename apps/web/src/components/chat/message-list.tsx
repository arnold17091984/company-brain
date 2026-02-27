"use client";

import type { Message } from "@/types";

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
			className="group flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50 transition-colors"
		>
			<span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 line-clamp-1">
				{title}
			</span>
			<span className="text-xs text-slate-500 line-clamp-2">{snippet}</span>
			<span className="text-xs text-slate-400">{formattedDate}</span>
		</a>
	);
}

function AssistantIcon() {
	return (
		<div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
			<svg
				className="w-4 h-4 text-white"
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
		<div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
			<svg
				className="w-4 h-4 text-slate-500"
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

function ChatMessage({ message }: { message: Message }) {
	const isUser = message.role === "user";

	return (
		<div
			className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
		>
			{isUser ? <UserIcon /> : <AssistantIcon />}

			<div
				className={`flex flex-col gap-2 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}
			>
				{/* Bubble */}
				<div
					className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
						isUser
							? "bg-blue-600 text-white rounded-tr-sm"
							: "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
					}`}
				>
					{message.content}
				</div>

				{/* Sources */}
				{!isUser &&
					message.sources &&
					message.sources.length > 0 && (
						<div className="w-full">
							<p className="text-xs text-slate-400 mb-1.5 ml-0.5">Sources</p>
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
}

export function MessageList({ messages }: MessageListProps) {
	return (
		<div className="chat-scroll h-full overflow-y-auto">
			<div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
				{messages.map((message) => (
					<ChatMessage key={message.id} message={message} />
				))}
			</div>
		</div>
	);
}
