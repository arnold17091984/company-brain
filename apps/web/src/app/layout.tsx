import { AuthSessionProvider } from "@/components/providers/session-provider";
import type { Metadata } from "next";
import { Inter, Noto_Sans_JP, Noto_Sans_KR } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-inter",
});

const notoJP = Noto_Sans_JP({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	display: "swap",
	variable: "--font-noto-jp",
});

const notoKR = Noto_Sans_KR({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	display: "swap",
	variable: "--font-noto-kr",
});

export const metadata: Metadata = {
	title: {
		default: "Company Brain",
		template: "%s | Company Brain",
	},
	description: "AI-powered knowledge engine for your company",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	// Read theme cookie for SSR dark mode class application
	const cookieStore = await cookies();
	const themeCookie = cookieStore.get("theme")?.value;
	const isDark = themeCookie === "dark";

	const fontVariables = [inter.variable, notoJP.variable, notoKR.variable].join(
		" ",
	);

	return (
		<html
			lang="en"
			className={`${fontVariables}${isDark ? " dark" : ""}`}
			suppressHydrationWarning
		>
			<body className="bg-(--color-bg-subtle) text-stone-900 antialiased font-sans dark:bg-(--color-bg-base) dark:text-(--color-fg-base)">
				<AuthSessionProvider>{children}</AuthSessionProvider>
			</body>
		</html>
	);
}
