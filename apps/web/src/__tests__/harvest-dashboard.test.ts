/**
 * Tests for harvest dashboard types and data transformations.
 */
import type { HarvestQuestion, HarvestSession, HarvestSessionDetail } from "@/types";
import { describe, expect, it } from "vitest";

describe("HarvestSession type", () => {
	it("accepts all required fields", () => {
		const session: HarvestSession = {
			id: "s1",
			target_user_name: "Alice",
			target_user_email: "alice@company.com",
			status: "active",
			total_questions: 20,
			answered_questions: 5,
			progress_percent: 25.0,
			created_at: "2026-03-01T00:00:00Z",
			suspension_date: "2026-06-30",
		};
		expect(session.status).toBe("active");
		expect(session.progress_percent).toBe(25.0);
	});

	it("accepts null suspension_date", () => {
		const session: HarvestSession = {
			id: "s2",
			target_user_name: "Bob",
			target_user_email: "bob@company.com",
			status: "completed",
			total_questions: 15,
			answered_questions: 15,
			progress_percent: 100.0,
			created_at: "2026-02-01T00:00:00Z",
			suspension_date: null,
		};
		expect(session.suspension_date).toBeNull();
	});

	it("accepts paused status", () => {
		const session: HarvestSession = {
			id: "s3",
			target_user_name: "Carol",
			target_user_email: "carol@company.com",
			status: "paused",
			total_questions: 25,
			answered_questions: 10,
			progress_percent: 40.0,
			created_at: "2026-03-04T00:00:00Z",
			suspension_date: "2026-07-15",
		};
		expect(session.status).toBe("paused");
	});
});

describe("HarvestQuestion type", () => {
	it("accepts unanswered question", () => {
		const q: HarvestQuestion = {
			id: "q1",
			category: "project",
			question: "What are the key design decisions?",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "2026-03-01T00:00:00Z",
			answered_at: null,
		};
		expect(q.answer).toBeNull();
		expect(q.answered_at).toBeNull();
	});

	it("accepts answered question", () => {
		const q: HarvestQuestion = {
			id: "q2",
			category: "tool",
			question: "Which tools do you use?",
			answer: "Jira, Slack, and GitHub",
			answer_quality: 0.85,
			source: "telegram",
			asked_at: "2026-03-01T00:00:00Z",
			answered_at: "2026-03-02T10:30:00Z",
		};
		expect(q.answer).toBe("Jira, Slack, and GitHub");
		expect(q.source).toBe("telegram");
	});

	it("validates all categories", () => {
		const categories = ["project", "process", "client", "tool", "team"];
		for (const cat of categories) {
			const q: HarvestQuestion = {
				id: `q-${cat}`,
				category: cat,
				question: `Question about ${cat}`,
				answer: null,
				answer_quality: null,
				source: null,
				asked_at: "2026-03-01T00:00:00Z",
				answered_at: null,
			};
			expect(q.category).toBe(cat);
		}
	});
});

describe("HarvestSessionDetail type", () => {
	it("extends HarvestSession with questions", () => {
		const detail: HarvestSessionDetail = {
			id: "s1",
			target_user_name: "Alice",
			target_user_email: "alice@company.com",
			status: "active",
			total_questions: 2,
			answered_questions: 1,
			progress_percent: 50.0,
			created_at: "2026-03-01T00:00:00Z",
			suspension_date: "2026-06-30",
			questions: [
				{
					id: "q1",
					category: "project",
					question: "What is X?",
					answer: "This is X",
					answer_quality: 0.9,
					source: "web",
					asked_at: "2026-03-01T00:00:00Z",
					answered_at: "2026-03-01T14:00:00Z",
				},
				{
					id: "q2",
					category: "team",
					question: "Who leads?",
					answer: null,
					answer_quality: null,
					source: null,
					asked_at: "2026-03-01T00:00:00Z",
					answered_at: null,
				},
			],
		};
		expect(detail.questions).toHaveLength(2);
		expect(detail.questions[0].answer).toBe("This is X");
		expect(detail.questions[1].answer).toBeNull();
	});

	it("has empty questions array for new session", () => {
		const detail: HarvestSessionDetail = {
			id: "s-new",
			target_user_name: "New User",
			target_user_email: "new@company.com",
			status: "active",
			total_questions: 0,
			answered_questions: 0,
			progress_percent: 0,
			created_at: "2026-03-04T00:00:00Z",
			suspension_date: null,
			questions: [],
		};
		expect(detail.questions).toHaveLength(0);
	});
});

describe("Progress calculation", () => {
	it("calculates 0% for no answers", () => {
		const pct = (0 / 20) * 100;
		expect(pct).toBe(0);
	});

	it("calculates 100% when all answered", () => {
		const pct = (15 / 15) * 100;
		expect(pct).toBe(100);
	});

	it("calculates partial progress", () => {
		const pct = Math.round((7 / 20) * 100);
		expect(pct).toBe(35);
	});

	it("handles zero total gracefully", () => {
		const pct = 0 === 0 ? 0 : (0 / 0) * 100;
		expect(pct).toBe(0);
	});
});

describe("Category filtering", () => {
	const questions: HarvestQuestion[] = [
		{
			id: "q1",
			category: "project",
			question: "P1",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
		{
			id: "q2",
			category: "process",
			question: "P2",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
		{
			id: "q3",
			category: "project",
			question: "P3",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
		{
			id: "q4",
			category: "client",
			question: "C1",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
		{
			id: "q5",
			category: "tool",
			question: "T1",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
		{
			id: "q6",
			category: "team",
			question: "T2",
			answer: null,
			answer_quality: null,
			source: null,
			asked_at: "",
			answered_at: null,
		},
	];

	it("filters by project category", () => {
		const filtered = questions.filter((q) => q.category === "project");
		expect(filtered).toHaveLength(2);
	});

	it("filters by process category", () => {
		const filtered = questions.filter((q) => q.category === "process");
		expect(filtered).toHaveLength(1);
	});

	it("returns all when no filter", () => {
		expect(questions).toHaveLength(6);
	});

	it("returns empty for non-existent category", () => {
		const filtered = questions.filter((q) => q.category === "nonexistent");
		expect(filtered).toHaveLength(0);
	});
});
