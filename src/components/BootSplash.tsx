"use client";
import { useEffect, useState } from "react";
import { SvMark } from "@/components/SvMark";

interface BootSplashProps {
  /** Called once the full sequence completes (after blast + flash) */
  onComplete?: () => void;
  /** Tagline shown briefly under the logo */
  tagline?: string;
}

/**
 * Cinematic 2.4s boot animation:
 *   1) Logo fades in + scales (0.6s)
 *   2) Pulses with glow (1.0s)
 *   3) Blasts outward + screen flashes white (0.8s)
 *   4) onComplete fires → parent navigates / unmounts splash
 */
export function BootSplash({ onComplete, tagline = "Initializing…" }: BootSplashProps) {
  const [phase, setPhase] = useState<"in" | "pulse" | "blast" | "done">("in");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("pulse"), 600);
    const t2 = setTimeout(() => setPhase("blast"), 1700);
    const t3 = setTimeout(() => { setPhase("done"); onComplete?.(); }, 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-[200] bg-canvas flex items-center justify-center overflow-hidden">
      {/* Radial accent wash */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-accent opacity-[0.05] blur-[140px]" />
      </div>

      {/* White flash overlay (fires during blast) */}
      {phase === "blast" && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{ animation: "boot-flash 0.8s ease both" }}
        />
      )}

      {/* Logo */}
      <div className="relative flex flex-col items-center gap-4 z-10">
        <div
          style={{
            animation:
              phase === "in"     ? "boot-logo-in 0.6s var(--ease-spring) both"
            : phase === "pulse" ? "boot-logo-pulse 1.1s ease-in-out infinite"
            : phase === "blast" ? "boot-logo-blast 0.8s cubic-bezier(0.22, 1, 0.36, 1) both"
            : undefined,
          }}
        >
          <SvMark size={140} />
        </div>

        {/* Tagline */}
        {(phase === "in" || phase === "pulse") && (
          <p
            className="text-[12px] uppercase tracking-[0.32em] text-text-3 font-600"
            style={{ animation: "boot-tagline 2.4s ease both" }}
          >
            {tagline}
          </p>
        )}
      </div>
    </div>
  );
}
