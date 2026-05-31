"use client";
// Mounts inside the protected layout. On first login (no onboarded_at),
// renders the full-screen wizard over everything. Once finished, POSTs the
// completion + reveals the dashboard. Renders nothing (just children pass-
// through) for already-onboarded users.
import { useEffect, useState } from "react";
import { OnboardingWizard } from "./OnboardingWizard";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  // null = still checking; true = show wizard; false = onboarded, show app
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding")
      .then(r => r.json())
      .then(d => { if (alive) setNeedsOnboarding(!d?.onboarded); })
      // On error, fail OPEN (show the app) — never trap the owner behind a
      // broken onboarding check.
      .catch(() => { if (alive) setNeedsOnboarding(false); });
    return () => { alive = false; };
  }, []);

  async function handleDone(tier: string) {
    try {
      await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
    } catch { /* best-effort — reveal the app regardless */ }
    setNeedsOnboarding(false);
  }

  // While checking, render the app underneath (BootSplash already covers the
  // first paint). Only overlay the wizard once we KNOW onboarding is needed.
  return (
    <>
      {children}
      {needsOnboarding === true && <OnboardingWizard onDone={handleDone} />}
    </>
  );
}
