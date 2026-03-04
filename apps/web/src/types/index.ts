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
	| "hr_compliance"
	| "engineering"
	| "sales"
	| "marketing"
	| "finance"
	| "policy"
	| "onboarding"
	| "project"
	| "meeting_notes";

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

// Feature 1: AI Template Market

export type TemplateCategory =
	| "cs"
	| "marketing"
	| "development"
	| "accounting"
	| "general_affairs"
	| "general";

export interface PromptTemplate {
	id: string;
	user_id: string;
	user_name: string;
	title: string;
	description: string;
	content: string;
	category: TemplateCategory;
	vote_count: number;
	copy_count: number;
	voted_by_me: boolean;
	created_at: string;
	updated_at: string;
}

export interface PromptTemplateListResponse {
	templates: PromptTemplate[];
	total: number;
	page: number;
	page_size: number;
}

// Feature 2: AI Recipe Book

export interface AIRecipe {
	id: string;
	title: string;
	description: string;
	prompt_template: string;
	example_query: string;
	example_response: string;
	department_id: string | null;
	department_name: string | null;
	category: string;
	effectiveness_score: number;
	usage_count: number;
	source: string;
	status: string;
	created_at: string;
	updated_at: string;
}

// Feature 3: Safety Monitor

export interface SafetyViolation {
	id: string;
	user_id: string;
	user_email: string;
	session_id: string | null;
	violation_type: string;
	risk_level: string;
	detected_categories: string[];
	context_snippet: string;
	action_taken: string;
	source: string;
	created_at: string;
	resolved_at: string | null;
	resolved_by: string | null;
}

export interface SafetyStats {
	total_violations: number;
	violations_today: number;
	blocked_count: number;
	masked_count: number;
	warned_count: number;
	top_violation_types: Array<{ type: string; count: number }>;
}

// Feature 4: ROI Analytics

export interface UsageMetric {
	user_id: string;
	user_name: string;
	user_email: string;
	department_name: string | null;
	date: string;
	query_count: number;
	total_input_tokens: number;
	total_output_tokens: number;
	avg_latency_ms: number;
	feedback_up: number;
	feedback_down: number;
}

export interface CorrelationDataPoint {
	user_id: string;
	user_name: string;
	department_name: string | null;
	query_count: number;
	total_tokens: number;
	kpi_achievement_pct: number;
}

export interface ROIReport {
	id: string;
	period: string;
	total_queries: number;
	total_tokens: number;
	active_users: number;
	avg_satisfaction_pct: number;
	estimated_hours_saved: number;
	estimated_cost_usd: number;
	department_breakdown: Record<string, unknown>;
	kpi_correlation: Record<string, unknown>;
	report_markdown: string;
	created_at: string;
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
	aiClassification?: {
		category: string;
		confidence: number;
		suggestedDepartment?: string;
		classifiedAt?: string;
		overridden?: boolean;
	};
}

// Feature: Knowledge Harvesting

export interface HarvestSession {
	id: string;
	target_user_name: string;
	target_user_email: string;
	status: "active" | "completed" | "paused";
	total_questions: number;
	answered_questions: number;
	progress_percent: number;
	created_at: string;
	departure_date: string | null;
}

export interface HarvestQuestion {
	id: string;
	category: string;
	question: string;
	answer: string | null;
	answer_quality: number | null;
	source: string | null;
	asked_at: string;
	answered_at: string | null;
}

export interface HarvestSessionDetail extends HarvestSession {
	questions: HarvestQuestion[];
}
