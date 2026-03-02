export { auth as middleware } from "@/lib/auth";

/**
 * Route protection middleware using NextAuth.js v5.
 *
 * The `authorized` callback in the auth config returns true/false.
 * When it returns false for a protected route, NextAuth automatically
 * redirects to the signIn page configured in `pages.signIn`.
 *
 * Public routes (login page, NextAuth API routes, static assets, health
 * checks) are excluded via the matcher config below.
 */
export const config = {
	matcher: [
		/*
		 * Match all paths EXCEPT:
		 * - /login (public sign-in page)
		 * - /api/auth/* (NextAuth.js API routes)
		 * - /_next/* (Next.js internals: static files, HMR, etc.)
		 * - /favicon.ico, /robots.txt, /sitemap.xml (static assets)
		 */
		"/((?!login|api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
	],
};
