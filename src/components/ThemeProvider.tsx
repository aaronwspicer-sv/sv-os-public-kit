"use client";
import { createContext, useContext, useEffect } from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;                  // user preference
  resolved: ResolvedTheme;       // what's actually applied
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Spicer OS is dark-first — it's a ship's bridge, not a daylight dashboard.
  // Light mode is retired; the OS is always dark. The useTheme() API is kept
  // (so existing consumers don't break) but always resolves to "dark".
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", resolved: "dark", setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}
