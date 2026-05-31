"use client";
import { useEffect, useState } from "react";
import { BootSplash } from "@/components/BootSplash";

const FLAG = "spicer_booted";

/**
 * Wraps the protected layout. On the FIRST mount of a browser session
 * (PWA launch, OAuth return, hard refresh, new tab), shows the boot splash
 * for 2.4s then reveals children. Subsequent client-side route changes
 * don't re-trigger it because the layout doesn't remount.
 */
export function BootGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"checking" | "booting" | "ready">("checking");

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FLAG) === "1") {
        setPhase("ready");
      } else {
        setPhase("booting");
      }
    } catch {
      // sessionStorage blocked (e.g. private mode) — just skip the splash
      setPhase("ready");
    }
  }, []);

  if (phase === "checking") {
    // Avoid hydration flash — render nothing until we've checked sessionStorage
    return null;
  }

  if (phase === "booting") {
    return (
      <BootSplash
        tagline="Welcome back"
        onComplete={() => {
          try { sessionStorage.setItem(FLAG, "1"); } catch {}
          setPhase("ready");
        }}
      />
    );
  }

  return <>{children}</>;
}
