import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Backend API base URL used server-side for token exchange.
 * Falls back to localhost for local development.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

declare module "next-auth" {
	interface Session {
		accessToken?: string;
		user: {
			id: string;
			email: string;
			name: string;
			image?: string | null;
			department?: string;
			departmentId?: string | null;
			accessLevel?: string;
		};
	}
}

declare module "@auth/core/jwt" {
	interface JWT {
		accessToken?: string;
		backendUserId?: string;
		department?: string;
		departmentId?: string | null;
		accessLevel?: string;
	}
}

/**
 * Exchange a Google ID token for an internal backend JWT.
 * Called during the NextAuth JWT callback on initial sign-in.
 */
async function exchangeTokenWithBackend(googleIdToken: string): Promise<{
	accessToken: string;
	userId: string;
	department: string;
	departmentId: string | null;
	accessLevel: string;
} | null> {
	try {
		const response = await fetch(`${API_BASE_URL}/api/v1/auth/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ google_token: googleIdToken }),
		});

		if (!response.ok) {
			console.error(
				"Backend token exchange failed:",
				response.status,
				await response.text(),
			);
			return null;
		}

		const data = await response.json();
		return {
			accessToken: data.access_token,
			userId: data.user.id,
			department: data.user.department ?? "",
			departmentId: data.user.department_id ?? null,
			accessLevel: data.user.access_level ?? "restricted",
		};
	} catch (error) {
		console.error("Backend token exchange error:", error);
		return null;
	}
}

export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [
		Google({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			authorization: {
				params: {
					prompt: "consent",
					access_type: "offline",
					response_type: "code",
				},
			},
		}),
	],
	session: {
		strategy: "jwt",
		maxAge: 24 * 60 * 60, // 24 hours - matches backend JWT expiry
	},
	callbacks: {
		async jwt({ token, account }) {
			// On initial sign-in, exchange the Google ID token with our backend
			if (account?.id_token) {
				const backendAuth = await exchangeTokenWithBackend(account.id_token);
				if (backendAuth) {
					token.accessToken = backendAuth.accessToken;
					token.backendUserId = backendAuth.userId;
					token.department = backendAuth.department;
					token.departmentId = backendAuth.departmentId;
					token.accessLevel = backendAuth.accessLevel;
				}
			}
			return token;
		},
		async session({ session, token }) {
			// Expose the backend JWT and user metadata on the client session
			if (token.accessToken) {
				session.accessToken = token.accessToken;
			}
			if (token.backendUserId) {
				session.user.id = token.backendUserId;
			}
			if (token.department) {
				session.user.department = token.department;
			}
			if (token.departmentId !== undefined) {
				session.user.departmentId = token.departmentId;
			}
			if (token.accessLevel) {
				session.user.accessLevel = token.accessLevel;
			}
			return session;
		},
		async authorized({ auth: session }) {
			// Return true if the user is authenticated
			return !!session?.user;
		},
	},
	pages: {
		signIn: "/login",
	},
});
