"use client";

import { MessageInput } from "@/components/chat/message-input";
import { MessageList } from "@/components/chat/message-list";
import { useChat } from "@/hooks/use-chat";

export default function ChatPage() {
	const { messages, sendMessage, isLoading, error, clearMessages } = useChat();

	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0 flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold text-slate-900">Chat</h1>
					<p className="text-sm text-slate-500 mt-0.5">
						Ask questions about your company knowledge base
					</p>
				</div>
				{messages.length > 0 && (
					<button
						type="button"
						onClick={clearMessages}
						className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
					>
						Clear chat
					</button>
				)}
			</div>

			{/* Error banner */}
			{error && (
				<div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-2">
					<svg
						className="w-4 h-4 text-red-500 flex-shrink-0"
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
					<div className="flex flex-col items-center justify-center h-full text-center px-6">
						<div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
							<svg
								className="w-8 h-8 text-blue-600"
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
						<p className="text-slate-700 font-medium">
							Ask anything about your company
						</p>
						<p className="text-slate-400 text-sm mt-1 max-w-xs">
							I can answer questions about policies, projects, team members, and
							all your company knowledge.
						</p>
					</div>
				) : (
					<MessageList messages={messages} isStreaming={isLoading} />
				)}
			</div>

			{/* Input */}
			<div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
				<MessageInput onSend={sendMessage} disabled={isLoading} />
			</div>
		</div>
	);
}
