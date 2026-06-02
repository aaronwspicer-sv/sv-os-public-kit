"use client";
// Mounts inside the protected layout. On first login (no onboarded_at),
// renders the full-screen wizard over everything. Once finished, POSTs the
// completion + reveals the dashboard. Renders nothing (just children pass-
// through) for already-onboarded users.
import { useEffect, useState } from "react";
import { OnboardingWizard } from "./OnboardingWizard";
import { GuidedTour } from "./GuidedTour";
import { config } from "@/config";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  // null = still checking; true = show wizard; false = onboarded, show app
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  // After the wizard finishes, run the Alfred-guided tour over the revealed OS.
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Public demo: no auth, no wizard — just run the demo walkthrough once per
    // browser session.
    if (config.isPublicDemo) {
      setNeedsOnboarding(false);
      try {
        if (sessionStorage.getItem("os_demo_tour_seen") !== "1") {
          setShowTour(true);
          sessionStorage.setItem("os_demo_tour_seen", "1");
        }
      } catch { setShowTour(true); }
      return;
    }
    let alive = true;
    fetch("/api/onboarding")
      .then(r => r.json())
      .then(d => { if (alive) setNeedsOnboarding(!d?.onboarded); })
      // On error, fail OPEN (show the app) — never trap the owner behind a
      // broken onboarding check.
      .catch(() => { if (alive) setNeedsOnboarding(false); });
    return () => { alive = false; };
  }, []);

  // Settings → "Replay walkthrough" dispatches this so the owner can re-run
  // the tour anytime.
  useEffect(() => {
    const onReplay = () => setShowTour(true);
    window.addEventListener("os:replay-tour", onReplay);
    return () => window.removeEventListener("os:replay-tour", onReplay);
  }, []);

  async function handleDone(tier: string) {
    try {
      await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
    } catch { /* best-effort — reveal the app regardless */ }
    setNeedsOnboarding(false);
    setShowTour(true); // reveal the OS, then walk them through it
  }

  // While checking, render the app underneath (BootSplash already covers the
  // first paint). Only overlay the wizard once we KNOW onboarding is needed.
  return (
    <>
      {children}
      {needsOnboarding === true && <OnboardingWizard onDone={handleDone} />}
      {showTour && <GuidedTour mode={config.isPublicDemo ? "demo" : "onboarding"} onDone={() => setShowTour(false)} />}
    </>
  );
}
