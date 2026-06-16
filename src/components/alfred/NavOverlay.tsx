"use client";
// Cinematic black-flash transition that fires when alfred:nav-start is dispatched.
// Phase: idle → in (250ms fade) → navigate → hold (200ms) → out (450ms fade) → idle
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Phase = "idle" | "in" | "hold" | "out";

export function NavOverlay() {
  const router   = useRouter();
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const prevPath  = useRef(pathname);
  const pendingUrl = useRef<string | null>(null);
  const phaseRef   = useRef<Phase>("idle");

  function setP(p: Phase) { phaseRef.current = p; setPhase(p); }

  useEffect(() => {
    const h = (e: Event) => {
      const url = (e as CustomEvent).detail?.url as string | undefined;
      if (!url) return;
      pendingUrl.current = url;
      setP("in");
      // After fade-in completes, push the route
      setTimeout(() => {
        router.push(url);
        setP("hold");
      }, 260);
    };
    window.addEventListener("alfred:nav-start", h);
    return () => window.removeEventListener("alfred:nav-start", h);
  }, [router]);

  // Once the pathname actually changes → start fade-out
  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      if (phaseRef.current === "hold" || phaseRef.current === "in") {
        setTimeout(() => {
          setP("out");
          setTimeout(() => setP("idle"), 460);
        }, 120);
      }
    }
  }, [pathname]);

  if (phase === "idle") return null;

  const opacity = phase === "out" ? 0 : 1;
  const duration = phase === "out" ? "0.45s" : "0.25s";

  return (
    <div
      className="fixed inset-0 z-[998] pointer-events-none select-none"
      style={{
        background: "radial-gradient(ellipse at 50% 50%, rgba(29,155,240,0.18) 0%, rgba(2,5,14,0.98) 55%, #000 100%)",
        opacity,
        transition: `opacity ${duration} ease-${phase === "out" ? "out" : "in"}`,
        backdropFilter: phase !== "out" ? "blur(8px)" : "none",
      }}
    >
      {/* Scanning line */}
      {phase !== "out" && (
        <div className="absolute left-0 right-0 h-px"
          style={{
            top: "50%",
            background: "linear-gradient(90deg, transparent, rgba(29,155,240,0.6), transparent)",
            animation: "alfred-sweep-h 0.5s ease-in-out",
          }}
        />
      )}
      {/* Center glyph */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{
          width: 48, height: 48,
          border: "1px solid rgba(29,155,240,0.4)",
          borderRadius: "50%",
          animation: "alfred-pulse-ring 0.6s ease-in-out infinite",
          boxShadow: "0 0 30px rgba(29,155,240,0.3)",
        }} />
      </div>
    </div>
  );
}
