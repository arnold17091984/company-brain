import { auth } from "@/lib/auth";
import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, locales } from "./i18n/config";

/**
 * next-intl middleware handles:
 * - Locale detection (cookie → Accept-Language → default "en")
 * - Redirecting non-locale paths (e.g. /chat → /en/chat)
 * - Setting the locale cookie for subsequent requests
 */
const intlMiddleware = createMiddleware({
	locales,
	defaultLocale,
	// Always prefix the locale in the URL (e.g. /en/chat, /ja/chat)
	localePrefix: "always",
	// Use the NEXT_LOCALE cookie name, detected before Accept-Language
	localeCookie: { name: "NEXT_LOCALE", sameSite: "lax" },
	// Locale detection reads cookie first, then Accept-Language header
	localeDetection: true,
});

/**
 * Routes that are publicly accessible without authentication.
 * Pattern matches any locale prefix followed by /login.
 */
function isPublicRoute(pathname: string): boolean {
	// Match /login, /en/login, /ja/login, /ko/login
	return /^\/(en|ja|ko)?\/?(login)?$/.test(pathname) && pathname.includes("login");
}

/**
 * Combined middleware: next-intl locale routing + NextAuth session guard.
 *
 * Flow:
 * 1. If the path is an API/auth or static asset route, skip and continue.
 * 2. Run next-intl middleware to resolve and prefix the locale.
 * 3. After locale resolution, check NextAuth session for protected routes.
 *    - Public routes (/[locale]/login) pass through.
 *    - Protected routes without a session redirect to /[locale]/login.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
	const { pathname } = request.nextUrl;

	// Let next-intl handle locale prefix detection and redirection first.
	// This covers bare paths like /chat → /en/chat.
	const intlResponse = intlMiddleware(request);

	// If next-intl issued a redirect (e.g. /chat → /en/chat), honour it
	// immediately without running auth — auth will run on the redirected request.
	if (intlResponse.status === 307 || intlResponse.status === 308) {
		return intlResponse;
	}

	// Determine the locale-stripped pathname for public route detection.
	// After intl middleware runs, the pathname already contains the locale prefix.
	const localePrefix = `/(${locales.join("|")})`;
	const pathnameWithoutLocale = pathname.replace(
		new RegExp(`^${localePrefix}`),
		"",
	);

	// Public routes bypass auth
	if (
		pathnameWithoutLocale === "/login" ||
		pathnameWithoutLocale === "" ||
		pathname === "/"
	) {
		return intlResponse;
	}

	// Check NextAuth session for all other routes
	const session = await auth();

	if (!session?.user) {
		// Determine the locale from the URL so we redirect to the correct
		// localised login page (e.g. /ja/login instead of /en/login).
		const localeMatch = pathname.match(new RegExp(`^/(${locales.join("|")})`));
		const locale = localeMatch ? localeMatch[1] : defaultLocale;

		const loginUrl = new URL(`/${locale}/login`, request.url);
		// Preserve the original destination so we can redirect after login
		loginUrl.searchParams.set("callbackUrl", request.url);
		return NextResponse.redirect(loginUrl);
	}

	return intlResponse;
}

export const config = {
	matcher: [
		/*
		 * Match all paths EXCEPT:
		 * - /api/auth/* (NextAuth.js API routes)
		 * - /_next/static, /_next/image (Next.js build assets)
		 * - /favicon.ico, /robots.txt, /sitemap.xml (static files)
		 */
		"/((?!api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
	],
};
