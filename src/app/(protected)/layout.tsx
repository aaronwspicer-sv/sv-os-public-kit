import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { PageTransition } from "@/components/ui/PageTransition";
import { CommandK } from "@/components/ui/CommandK";
import { SwRegister } from "@/components/security/SwRegister";
import { IdleLock } from "@/components/security/IdleLock";
import { SessionPing } from "@/components/security/SessionPing";
import { AlfredFab } from "@/components/alfred/AlfredFab";
import { WakeWord } from "@/components/alfred/WakeWord";
import { ProactiveChecker } from "@/components/alfred/ProactiveChecker";
import { AlfredBar } from "@/components/alfred/AlfredBar";
import { AlfredMiniOrb } from "@/components/alfred/AlfredMiniOrb";
import { NavOverlay } from "@/components/alfred/NavOverlay";
import { CameraWatch } from "@/components/alfred/CameraWatch";
import { AlfredDockProvider } from "@/lib/alfred/dockContext";
import { RealtimeProvider } from "@/lib/alfred/realtimeContext";
import { AlfredVoiceBanner } from "@/components/alfred/AlfredVoiceBanner";
import { BootGate } from "@/components/BootGate";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { DemoModeProvider } from "@/components/ui/DemoModeContext";
import { DemoModeBanner } from "@/components/ui/DemoModeBanner";
import { config } from "@/config";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Public demo deploy: skip auth entirely and render the shell with fake data.
  // (middleware already lets these requests through.) Real deploys never set
  // NEXT_PUBLIC_DEMO_MODE, so this branch is dead code in production.
  if (!config.isPublicDemo) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Not logged in
    if (!user) redirect("/login");

    // Wrong account — sign out and block. Single source of truth in lib/auth
    // (which lowercases the comparison). Previously this file had its own
    // copy of the allowlist that did NOT lowercase, so a Supabase user whose
    // stored email had any uppercase characters (e.g. "Aaronwspicer@…")
    // would pass middleware + auth.ts but get signed out here.
    if (!isAllowedEmail(user.email)) {
      await supabase.auth.signOut();
      redirect("/login?error=unauthorized");
    }
  }

  return (
    <ToastProvider>
      <DemoModeProvider>
      <AlfredDockProvider>
      <RealtimeProvider>
      <BootGate>
        <OnboardingGate>
        <div className="min-h-screen bg-canvas">
          <DemoModeBanner />
          <Sidebar />
          <main className="md:ml-[220px] min-h-screen pb-24 md:pb-9">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 md:py-8">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
          <MobileNav />
          <CommandK />
          <SwRegister />
          <IdleLock />
          <SessionPing />
          <AlfredFab />
          <AlfredVoiceBanner />
          <WakeWord />
          <ProactiveChecker />
          <AlfredBar />
          <AlfredMiniOrb />
          <NavOverlay />
          <CameraWatch />
        </div>
        </OnboardingGate>
      </BootGate>
      </RealtimeProvider>
      </AlfredDockProvider>
      </DemoModeProvider>
    </ToastProvider>
  );
}
