import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
	theme: Theme;
	resolvedTheme: "dark" | "light";
	setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
	children: React.ReactNode;
	defaultTheme?: Theme;
	attribute?: string;
	enableSystem?: boolean;
}

export function ThemeProvider({
	children,
	defaultTheme = "system",
	attribute = "class",
	enableSystem = true,
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() => {
		// Only access localStorage on client side
		if (typeof window === "undefined") {
			return defaultTheme;
		}

		try {
			const stored = localStorage.getItem("theme") as Theme;
			return stored || defaultTheme;
		} catch {
			return defaultTheme;
		}
	});

	const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">(() => {
		if (typeof window === "undefined") {
			return "light"; // Default for SSR
		}

		if (theme === "system" && enableSystem) {
			return window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}

		return theme === "dark" ? "dark" : "light";
	});

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);

		if (typeof window !== "undefined") {
			try {
				localStorage.setItem("theme", newTheme);
			} catch {
				// Handle localStorage errors gracefully
			}
		}
	};

	// Handle system theme changes
	useEffect(() => {
		if (!enableSystem || typeof window === "undefined") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const handleChange = () => {
			if (theme === "system") {
				setResolvedTheme(mediaQuery.matches ? "dark" : "light");
			}
		};

		// Set initial resolved theme
		handleChange();

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme, enableSystem]);

	// Update resolved theme when theme changes
	useEffect(() => {
		if (typeof window === "undefined") return;

		if (theme === "system" && enableSystem) {
			const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
			setResolvedTheme(isDark ? "dark" : "light");
		} else {
			setResolvedTheme(theme === "dark" ? "dark" : "light");
		}
	}, [theme, enableSystem]);

	// Apply theme to document
	useEffect(() => {
		if (typeof window === "undefined") return;

		const root = window.document.documentElement;

		if (attribute === "class") {
			root.classList.remove("light", "dark");
			root.classList.add(resolvedTheme);
		} else {
			root.setAttribute(attribute, resolvedTheme);
		}
	}, [resolvedTheme, attribute]);

	// Hydration-safe mounting
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// Prevent hydration mismatch by not rendering theme-dependent content until mounted
	if (!mounted) {
		return (
			<ThemeContext.Provider
				value={{ theme: defaultTheme, resolvedTheme: "light", setTheme }}
			>
				{children}
			</ThemeContext.Provider>
		);
	}

	return (
		<ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
