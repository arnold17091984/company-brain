import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next-auth before importing the module
vi.mock("@/lib/auth", () => ({
	auth: vi.fn().mockResolvedValue(null),
}));

import { ApiError, createApiClient } from "@/lib/api";

// ---- ApiError ---------------------------------------------------------------

describe("ApiError", () => {
	it("stores status and body", () => {
		const err = new ApiError(404, { detail: "not found" });
		expect(err.status).toBe(404);
		expect(err.body).toEqual({ detail: "not found" });
		expect(err.name).toBe("ApiError");
	});

	it("generates default message from status", () => {
		const err = new ApiError(500, null);
		expect(err.message).toBe("API request failed with status 500");
	});

	it("uses custom message when provided", () => {
		const err = new ApiError(400, null, "Bad input");
		expect(err.message).toBe("Bad input");
	});

	it("isUnauthorized returns true for 401", () => {
		expect(new ApiError(401, null).isUnauthorized).toBe(true);
	});

	it("isUnauthorized returns false for other codes", () => {
		expect(new ApiError(403, null).isUnauthorized).toBe(false);
		expect(new ApiError(500, null).isUnauthorized).toBe(false);
	});
});

// ---- createApiClient --------------------------------------------------------

describe("createApiClient", () => {
	const TOKEN = "test-jwt-token";

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("attaches Authorization header with given token", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({ data: "ok" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const client = createApiClient(TOKEN);
		await client("/api/v1/health");

		const [, options] = mockFetch.mock.calls[0];
		expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("throws ApiError on non-2xx responses", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 422,
			json: () => Promise.resolve({ detail: "validation error" }),
		});
		vi.stubGlobal("fetch", mockFetch);

		const client = createApiClient(TOKEN);
		await expect(client("/api/v1/chat/stream")).rejects.toThrow(ApiError);
	});

	it("returns undefined for 204 No Content", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 204,
			json: () => Promise.resolve(null),
		});
		vi.stubGlobal("fetch", mockFetch);

		const client = createApiClient(TOKEN);
		const result = await client("/api/v1/feedback");
		expect(result).toBeUndefined();
	});

	it("builds full URL from path", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({}),
		});
		vi.stubGlobal("fetch", mockFetch);

		const client = createApiClient(TOKEN);
		await client("/api/v1/knowledge/query");

		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe("http://localhost:8000/api/v1/knowledge/query");
	});

	it("merges custom headers with defaults", async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: () => Promise.resolve({}),
		});
		vi.stubGlobal("fetch", mockFetch);

		const client = createApiClient(TOKEN);
		await client("/api/v1/chat", {
			headers: { "X-Custom": "value" },
		});

		const [, options] = mockFetch.mock.calls[0];
		expect(options.headers["Content-Type"]).toBe("application/json");
		expect(options.headers["X-Custom"]).toBe("value");
		expect(options.headers.Authorization).toBe(`Bearer ${TOKEN}`);
	});
});
