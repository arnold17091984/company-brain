"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getInitialTheme(): Theme {
	// SSR guard
	if (typeof window === "undefined") return "light";

	// 1. Check cookie (set by SSR-aware logic)
	const cookieMatch = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
	if (cookieMatch) {
		const val = cookieMatch[1];
		if (val === "dark" || val === "light") return val;
	}

	// 2. Check localStorage
	const stored = localStorage.getItem("theme");
	if (stored === "dark" || stored === "light") return stored;

	// 3. Respect OS preference
	if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";

	return "light";
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
	const [theme, setThemeState] = useState<Theme>("light");

	// Apply the initial theme on mount (client only)
	useEffect(() => {
		const initial = getInitialTheme();
		setThemeState(initial);
		applyTheme(initial);
	}, []);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		applyTheme(newTheme);
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
