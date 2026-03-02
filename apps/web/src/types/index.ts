export interface Source {
	title: string;
	url: string;
	snippet: string;
	updatedAt: string;
}

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	sources?: Source[];
}

export interface ChatSession {
	id: string;
	messages: Message[];
}

export interface ChatSessionSummary {
	id: string;
	title: string;
	updated_at: string;
	message_count: number;
}
