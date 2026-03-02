"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./theme-provider";

export function AuthSessionProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SessionProvider>
			<ThemeProvider>{children}</ThemeProvider>
		</SessionProvider>
	);
}

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<ThemeProvider>{children}</ThemeProvider>
		</SessionProvider>
	);
}
