"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): Theme {
	// SSR guard — default to dark for premium feel
	if (typeof window === "undefined") return "dark";

	// 1. Check cookie (set by SSR-aware logic)
	const cookieMatch = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
	if (cookieMatch) {
		const val = cookieMatch[1];
		if (val === "dark" || val === "light" || val === "system") return val;
	}

	// 2. Check localStorage
	const stored = localStorage.getItem("theme");
	if (stored === "dark" || stored === "light" || stored === "system")
		return stored;

	// 3. Default to dark
	return "dark";
}

function resolveTheme(theme: Theme): "light" | "dark" {
	if (theme === "system") {
		if (typeof window === "undefined") return "dark";
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	}
	return theme;
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	if (theme === "dark") {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}

function persistTheme(theme: Theme) {
	// localStorage
	localStorage.setItem("theme", theme);
	// Cookie — accessible server-side for SSR class application
	document.cookie = `theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	// Always start with "dark" to match SSR output, then sync on mount
	const [theme, setThemeState] = useState<Theme>("dark");

	// Sync stored theme on mount (client only)
	useEffect(() => {
		if (!localStorage.getItem("theme-v2-migrated")) {
			localStorage.setItem("theme-v2-migrated", "1");
			setThemeState("dark");
			applyTheme("dark");
			persistTheme("dark");
			return;
		}
		const stored = getStoredTheme();
		setThemeState(stored);
		applyTheme(resolveTheme(stored));
	}, []);

	// Listen for OS preference changes when theme is "system"
	useEffect(() => {
		if (theme !== "system") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => applyTheme(resolveTheme("system"));
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		applyTheme(resolveTheme(newTheme));
		persistTheme(newTheme);
	}, []);

	const toggleTheme = useCallback(() => {
		setTheme(theme === "dark" ? "light" : "dark");
	}, [theme, setTheme]);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return ctx;
}
