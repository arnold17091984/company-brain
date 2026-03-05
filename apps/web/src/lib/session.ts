import type { Session } from "next-auth";

/**
 * Extract the backend access token from a NextAuth session.
 *
 * In development (when no Google OAuth is configured), falls back to
 * `"dev-token"` so the backend accepts requests with a mock user.
 *
 * Usage:
 * ```ts
 * const { data: session } = useSession();
 * const token = getAccessToken(session);
 * ```
 */
export function getAccessToken(session: Session | null): string {
	return session?.accessToken ?? "dev-token";
}
