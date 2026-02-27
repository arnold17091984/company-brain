import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-inter",
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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={inter.variable}>
			<body className="bg-slate-50 text-slate-900 antialiased font-sans">
				{children}
			</body>
		</html>
	);
}
