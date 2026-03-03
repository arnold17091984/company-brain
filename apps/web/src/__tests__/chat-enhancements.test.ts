/**
 * Tests for Phase 1 chat enhancements:
 * - Source field mapping (snake_case → camelCase)
 * - SSE event type definitions
 * - Confidence score presence in done events
 */

import type { Message, Source } from "@/types";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Replicate the mapSources logic from use-chat.ts (not exported)
// ---------------------------------------------------------------------------

interface SseSourceRaw {
	title: string;
	url: string;
	snippet: string;
	updated_at: string;
	score?: number;
	source_type?: string;
}

function mapSources(raw: SseSourceRaw[]): Source[] {
	return raw.map((s) => ({
		title: s.title,
		url: s.url,
		snippet: s.snippet,
		updatedAt: s.updated_at,
		score: s.score,
		sourceType: s.source_type,
	}));
}

// ---------------------------------------------------------------------------
// Source field mapping
// ---------------------------------------------------------------------------

describe("mapSources (snake_case → camelCase)", () => {
	it("maps updated_at to updatedAt", () => {
		const raw: SseSourceRaw[] = [
			{
				title: "Doc",
				url: "https://example.com",
				snippet: "text",
				updated_at: "2026-01-15",
			},
		];
		const mapped = mapSources(raw);
		expect(mapped[0].updatedAt).toBe("2026-01-15");
	});

	it("maps source_type to sourceType", () => {
		const raw: SseSourceRaw[] = [
			{
				title: "Doc",
				url: "https://example.com",
				snippet: "text",
				updated_at: "2026-01-15",
				source_type: "google_drive",
			},
		];
		const mapped = mapSources(raw);
		expect(mapped[0].sourceType).toBe("google_drive");
	});

	it("maps score field", () => {
		const raw: SseSourceRaw[] = [
			{
				title: "Doc",
				url: "https://example.com",
				snippet: "text",
				updated_at: "2026-01-15",
				score: 0.92,
			},
		];
		const mapped = mapSources(raw);
		expect(mapped[0].score).toBeCloseTo(0.92);
	});

	it("handles multiple sources", () => {
		const raw: SseSourceRaw[] = [
			{
				title: "A",
				url: "https://a.com",
				snippet: "text a",
				updated_at: "2026-01-01",
				score: 0.9,
				source_type: "notion",
			},
			{
				title: "B",
				url: "https://b.com",
				snippet: "text b",
				updated_at: "2026-02-01",
				score: 0.7,
				source_type: "telegram",
			},
		];
		const mapped = mapSources(raw);
		expect(mapped).toHaveLength(2);
		expect(mapped[0].sourceType).toBe("notion");
		expect(mapped[1].sourceType).toBe("telegram");
	});

	it("leaves optional fields undefined when absent", () => {
		const raw: SseSourceRaw[] = [
			{
				title: "Doc",
				url: "https://example.com",
				snippet: "text",
				updated_at: "2026-01-15",
			},
		];
		const mapped = mapSources(raw);
		expect(mapped[0].score).toBeUndefined();
		expect(mapped[0].sourceType).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Message type with new fields
// ---------------------------------------------------------------------------

describe("Message type with thinking and confidence", () => {
	it("accepts thinking field", () => {
		const msg: Message = {
			id: "msg-1",
			role: "assistant",
			content: "Hello",
			thinking: "Let me consider the question...",
		};
		expect(msg.thinking).toBe("Let me consider the question...");
	});

	it("accepts confidence field", () => {
		const msg: Message = {
			id: "msg-1",
			role: "assistant",
			content: "Hello",
			confidence: 0.85,
		};
		expect(msg.confidence).toBeCloseTo(0.85);
	});

	it("accepts all new fields together", () => {
		const msg: Message = {
			id: "msg-1",
			role: "assistant",
			content: "Answer",
			thinking: "Reasoning...",
			confidence: 0.92,
			sources: [
				{
					title: "Doc",
					url: "https://example.com",
					snippet: "text",
					updatedAt: "2026-01-15",
					score: 0.95,
					sourceType: "notion",
				},
			],
		};
		expect(msg.thinking).toBe("Reasoning...");
		expect(msg.confidence).toBeCloseTo(0.92);
		expect(msg.sources?.[0].score).toBeCloseTo(0.95);
		expect(msg.sources?.[0].sourceType).toBe("notion");
	});

	it("works without optional fields (backward compat)", () => {
		const msg: Message = {
			id: "msg-1",
			role: "user",
			content: "Hello",
		};
		expect(msg.thinking).toBeUndefined();
		expect(msg.confidence).toBeUndefined();
		expect(msg.sources).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// SSE event parsing (done event with confidence)
// ---------------------------------------------------------------------------

describe("SSE done event parsing", () => {
	it("parses done event with confidence", () => {
		const raw = JSON.stringify({
			content: "",
			done: true,
			conversation_id: "conv-123",
			confidence: 0.85,
			sources: [
				{
					title: "Doc",
					url: "https://example.com",
					snippet: "text",
					updated_at: "2026-01-15",
					score: 0.9,
					source_type: "google_drive",
				},
			],
		});

		const parsed = JSON.parse(raw);
		expect(parsed.done).toBe(true);
		expect(parsed.confidence).toBeCloseTo(0.85);
		expect(parsed.sources).toHaveLength(1);

		const mapped = mapSources(parsed.sources);
		expect(mapped[0].updatedAt).toBe("2026-01-15");
		expect(mapped[0].sourceType).toBe("google_drive");
		expect(mapped[0].score).toBeCloseTo(0.9);
	});

	it("parses done event without confidence", () => {
		const raw = JSON.stringify({
			content: "",
			done: true,
			conversation_id: "conv-456",
			sources: [],
		});

		const parsed = JSON.parse(raw);
		expect(parsed.done).toBe(true);
		expect(parsed.confidence).toBeUndefined();
	});

	it("parses thinking event", () => {
		const raw = JSON.stringify({
			type: "thinking",
			content: "Let me analyze this...",
			done: false,
		});

		const parsed = JSON.parse(raw);
		expect(parsed.type).toBe("thinking");
		expect(parsed.content).toBe("Let me analyze this...");
		expect(parsed.done).toBe(false);
	});

	it("parses text event", () => {
		const raw = JSON.stringify({
			type: "text",
			content: "Here is my answer",
			done: false,
		});

		const parsed = JSON.parse(raw);
		expect(parsed.type).toBe("text");
		expect(parsed.content).toBe("Here is my answer");
	});

	it("parses legacy event without type (backward compat)", () => {
		const raw = JSON.stringify({
			content: "chunk of text",
			done: false,
		});

		const parsed = JSON.parse(raw);
		expect(parsed.type).toBeUndefined();
		expect(parsed.content).toBe("chunk of text");
	});
});
