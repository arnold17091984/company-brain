export interface Source {
	title: string;
	url: string;
	snippet: string;
	updatedAt: string;
	score?: number;
	sourceType?: string;
}

export interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	sources?: Source[];
	thinking?: string;
	confidence?: number;
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

export type DocumentCategory =
	| "general"
	| "hr_evaluation"
	| "hr_compensation"
	| "hr_contract"
	| "hr_attendance"
	| "hr_skills"
	| "hr_org"
	| "hr_compliance";

export type UserRole =
	| "employee"
	| "manager"
	| "hr"
	| "executive"
	| "ceo"
	| "admin";

export interface ACLEntry {
	granteeType: "user" | "role" | "department";
	granteeId: string;
	permission: "read" | "write";
}

export interface DocumentItem {
	id: string;
	title: string;
	sourceType: string;
	status: "processing" | "indexed" | "error";
	accessLevel: string;
	createdAt: string;
	updatedAt: string;
	indexedAt?: string;
	fileSize?: number;
	mimeType?: string;
	category?: DocumentCategory;
	relatedEmployeeId?: string;
}
