"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "spicer_demo_mode";

interface DemoModeContextValue {
  isDemoMode: boolean;
  toggleDemoMode: () => void;
  enableDemoMode: () => void;
  disableDemoMode: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue>({
  isDemoMode: false,
  toggleDemoMode: () => {},
  enableDemoMode: () => {},
  disableDemoMode: () => {},
});

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    try {
      setIsDemoMode(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  const set = useCallback((val: boolean) => {
    setIsDemoMode(val);
    try { val ? localStorage.setItem(STORAGE_KEY, "1") : localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        set(!isDemoMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDemoMode, set]);

  return (
    <DemoModeContext.Provider value={{
      isDemoMode,
      toggleDemoMode: () => set(!isDemoMode),
      enableDemoMode: () => set(true),
      disableDemoMode: () => set(false),
    }}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
