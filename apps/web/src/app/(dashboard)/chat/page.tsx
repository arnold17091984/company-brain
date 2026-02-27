import type { Metadata } from "next";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import type { Message } from "@/types";

export const metadata: Metadata = {
	title: "Chat",
};

// Stub messages for UI demonstration
const STUB_MESSAGES: Message[] = [
	{
		id: "1",
		role: "assistant",
		content:
			"Hello! I'm Company Brain, your AI-powered knowledge assistant. Ask me anything about your company's documents, policies, or internal knowledge.",
		sources: [],
	},
	{
		id: "2",
		role: "user",
		content: "What is our parental leave policy?",
	},
	{
		id: "3",
		role: "assistant",
		content:
			"Based on the HR Policy Handbook (updated January 2025), the company offers 16 weeks of fully paid parental leave for primary caregivers and 4 weeks for secondary caregivers. Leave can be taken any time within the first 12 months of a child's birth or adoption.",
		sources: [
			{
				title: "HR Policy Handbook 2025",
				url: "/docs/hr-policy-handbook-2025",
				snippet:
					"Primary caregivers are entitled to 16 weeks of fully paid parental leave...",
				updatedAt: "2025-01-15T00:00:00Z",
			},
		],
	},
];

export default function ChatPage() {
	return (
		<div className="flex flex-col h-full">
			{/* Page header */}
			<div className="border-b border-slate-200 bg-white px-6 py-4 flex-shrink-0">
				<h1 className="text-lg font-semibold text-slate-900">Chat</h1>
				<p className="text-sm text-slate-500 mt-0.5">
					Ask questions about your company knowledge base
				</p>
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-hidden">
				<MessageList messages={STUB_MESSAGES} />
			</div>

			{/* Input */}
			<div className="flex-shrink-0 border-t border-slate-200 bg-white px-6 py-4">
				<MessageInput />
			</div>
		</div>
	);
}
