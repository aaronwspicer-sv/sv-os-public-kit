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
import { BootGate } from "@/components/BootGate";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
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

  return (
    <ToastProvider>
      <BootGate>
        <OnboardingGate>
        <div className="min-h-screen bg-canvas">
          <Sidebar />
          <main className="md:ml-[220px] min-h-screen pb-24 md:pb-0">
            <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
              <PageTransition>{children}</PageTransition>
            </div>
          </main>
          <MobileNav />
          <CommandK />
          <SwRegister />
          <IdleLock />
          <SessionPing />
          <AlfredFab />
          <WakeWord />
        </div>
        </OnboardingGate>
      </BootGate>
    </ToastProvider>
  );
}
