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
	// SSR guard — default to dark for premium feel
	if (typeof window === "undefined") return "dark";

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

	return "dark";
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
	// Use lazy initializer so the first client render matches SSR output
	const [theme, setThemeState] = useState<Theme>(getInitialTheme);

	// Ensure DOM class is in sync on mount + one-time migration to dark premium
	useEffect(() => {
		if (!localStorage.getItem("theme-v2-migrated")) {
			localStorage.setItem("theme-v2-migrated", "1");
			setThemeState("dark");
			applyTheme("dark");
			persistTheme("dark");
			return;
		}
		// Apply current theme on mount; subsequent changes handled by setTheme
		applyTheme(getInitialTheme());
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
