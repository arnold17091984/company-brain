import { auth } from "@/lib/auth";

/**
 * Backend API base URL.
 * Set NEXT_PUBLIC_API_URL in your environment for production deployments.
 * Defaults to localhost:8000 for local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Error thrown when an API request fails.
 * Includes the HTTP status code and response body for debugging.
 */
export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message?: string,
	) {
		super(message ?? `API request failed with status ${status}`);
		this.name = "ApiError";
	}

	/**
	 * Returns true if this error represents an authentication failure.
	 */
	get isUnauthorized(): boolean {
		return this.status === 401;
	}
}

/**
 * Options for API requests.
 */
interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
	headers?: Record<string, string>;
	/**
	 * If true, skip automatic token attachment.
	 * Useful for public endpoints like /health.
	 */
	skipAuth?: boolean;
}

/**
 * Get the current session's access token.
 * This function works server-side via the auth() helper.
 * For client components, pass the token explicitly.
 */
async function getAccessToken(): Promise<string | null> {
	try {
		const session = await auth();
		return session?.accessToken ?? null;
	} catch {
		return null;
	}
}

/**
 * Make an authenticated API request to the backend.
 *
 * Automatically attaches the Bearer token from the current session.
 * Throws an ApiError on non-2xx responses.
 *
 * @param path - API path relative to the base URL (e.g., "/api/v1/chat")
 * @param options - Fetch options with optional auth override
 * @returns The parsed JSON response
 *
 * @example
 * ```ts
 * // Server Component or API Route
 * const data = await api("/api/v1/knowledge/query", {
 *   method: "POST",
 *   body: JSON.stringify({ query: "What is the leave policy?" }),
 * });
 * ```
 */
export async function api<T = unknown>(
	path: string,
	options: ApiRequestOptions = {},
): Promise<T> {
	const {
		skipAuth = false,
		headers: customHeaders = {},
		...fetchOptions
	} = options;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...customHeaders,
	};

	// Attach auth token unless explicitly skipped
	if (!skipAuth) {
		const token = await getAccessToken();
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}
	}

	const url = `${API_BASE_URL}${path}`;

	const response = await fetch(url, {
		...fetchOptions,
		headers,
	});

	if (!response.ok) {
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			body = await response.text();
		}

		throw new ApiError(response.status, body);
	}

	// Handle 204 No Content
	if (response.status === 204) {
		return undefined as T;
	}

	return response.json() as Promise<T>;
}

/**
 * Create an API client function pre-configured with an access token.
 *
 * Useful for client components where the token is obtained from the session
 * and passed down as a prop or via context, avoiding server-side auth() calls.
 *
 * @param accessToken - The Bearer token to attach to requests
 * @returns A fetch wrapper identical to `api()` but using the provided token
 *
 * @example
 * ```tsx
 * "use client";
 * import { createApiClient } from "@/lib/api";
 *
 * function MyComponent({ accessToken }: { accessToken: string }) {
 *   const api = createApiClient(accessToken);
 *   // use api("/api/v1/...") in event handlers
 * }
 * ```
 */
export function createApiClient(accessToken: string) {
	return async function clientApi<T = unknown>(
		path: string,
		options: Omit<ApiRequestOptions, "skipAuth"> = {},
	): Promise<T> {
		const { headers: customHeaders = {}, ...fetchOptions } = options;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
			...customHeaders,
		};

		const url = `${API_BASE_URL}${path}`;

		const response = await fetch(url, {
			...fetchOptions,
			headers,
		});

		if (!response.ok) {
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				body = await response.text();
			}

			throw new ApiError(response.status, body);
		}

		if (response.status === 204) {
			return undefined as T;
		}

		return response.json() as Promise<T>;
	};
}
