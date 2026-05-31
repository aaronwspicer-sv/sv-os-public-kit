"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;                  // user preference
  resolved: ResolvedTheme;       // what's actually applied
  setTheme: (t: Theme) => void;
}

const STORAGE_KEY = "spicer_theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");
  const [hydrated, setHydrated] = useState(false);

  // Initial load from localStorage
  useEffect(() => {
    let stored: Theme = "dark";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {}
    setThemeState(stored);
    const r = stored === "system" ? getSystemTheme() : stored;
    setResolved(r);
    applyTheme(r);
    setHydrated(true);
  }, []);

  // React to system preference changes (only when user picked "system")
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const r = mq.matches ? "light" : "dark";
      setResolved(r);
      applyTheme(r);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    const r = t === "system" ? getSystemTheme() : t;
    setResolved(r);
    applyTheme(r);
  }, []);

  // Render children immediately to avoid hydration mismatch — the data-theme
  // attribute is set as soon as effects run (very fast, no flash worth blocking on)
  void hydrated;

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
