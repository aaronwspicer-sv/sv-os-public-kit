"use client";
// First-login wizard. Hard-gates the dashboard on first login (full-screen
// overlay), but every step is skippable. Tier picker first, then the steps
// for that tier. Finishing (even by skipping) marks onboarded + reveals the OS.
import { useState } from "react";
import { config } from "@/config";
import { Button } from "@/components/ui/Button";
import { TotpSetup } from "@/components/security/TotpSetup";
import { PasskeySetup } from "@/components/security/PasskeySetup";
import { PushSetup } from "@/components/security/PushSetup";
import { SvGptEditor } from "@/components/settings/SvGptEditor";
import {
  Shield, KeyRound, Smartphone, Bell, Sparkles, Lock, Check,
  ChevronRight, Zap, Layers, Crown, Bot,
} from "lucide-react";

type Tier = "quick" | "full" | "power";
type StepId = "pin" | "totp" | "passkey" | "push" | "finance" | "alfred" | "autonomy";

const STEPS_BY_TIER: Record<Tier, StepId[]> = {
  quick: ["pin", "alfred", "autonomy"],
  full:  ["pin", "totp", "passkey", "push", "alfred", "autonomy"],
  power: ["pin", "totp", "passkey", "push", "finance", "alfred", "autonomy"],
};

const TIER_CARDS: { id: Tier; icon: any; title: string; time: string; blurb: string }[] = [
  { id: "quick", icon: Zap,    title: "Quick",  time: "~2 min", blurb: "Lock it with a PIN and make Alfred yours. Add more security later." },
  { id: "full",  icon: Layers, title: "Full",   time: "~6 min", blurb: "PIN, 2FA, a passkey, and push notifications. The recommended setup." },
  { id: "power", icon: Crown,  title: "Power",  time: "~10 min", blurb: "Everything in Full, plus the finance vault. For the security-conscious." },
];

export function OnboardingWizard({ onDone }: { onDone: (tier: Tier) => void }) {
  const [tier, setTier] = useState<Tier | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);

  // Filter finance step out if the feature is disabled
  const steps = (tier ? STEPS_BY_TIER[tier] : []).filter(
    s => s !== "finance" || config.features.financeVault,
  );
  const isLast = stepIdx >= steps.length;

  async function finish(chosen: Tier) {
    setFinishing(true);
    onDone(chosen);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-canvas overflow-y-auto">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(ellipse, rgba(29,155,240,0.12) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 max-w-lg mx-auto px-5 py-12 min-h-screen flex flex-col">
        {/* ── Tier picker ── */}
        {!tier ? (
          <div className="flex-1 flex flex-col justify-center animate-fade-up">
            <p className="text-[11px] uppercase tracking-[0.22em] text-accent mb-2">Welcome to {config.brand.name}</p>
            <h1 className="text-[28px] font-700 tracking-tight mb-2">Let&apos;s set it up.</h1>
            <p className="text-[13px] text-text-3 leading-relaxed mb-7">
              Pick how much to configure now. You can always do more later in Settings —
              nothing here is permanent.
            </p>
            <div className="flex flex-col gap-3">
              {TIER_CARDS.map(({ id, icon: Icon, title, time, blurb }) => (
                <button key={id} onClick={() => { setTier(id); setStepIdx(0); }}
                  className="group text-left glass-1 rounded-[14px] p-4 border border-border-dim hover:border-[rgba(29,155,240,0.4)] transition-all flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-[11px] bg-accent-dim border border-[rgba(29,155,240,0.22)] flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-700">{title}</span>
                      <span className="text-[10px] text-text-3 tabular-nums">{time}</span>
                    </div>
                    <p className="text-[12px] text-text-3 leading-snug mt-0.5">{blurb}</p>
                  </div>
                  <ChevronRight size={16} className="text-text-3 group-hover:text-accent transition-colors flex-shrink-0 mt-1" />
                </button>
              ))}
            </div>
          </div>
        ) : isLast ? (
          // ── Done ──
          <DoneScreen tier={tier} finishing={finishing} onFinish={() => finish(tier)} />
        ) : (
          // ── A step ──
          <div className="flex-1 flex flex-col animate-fade-up">
            {/* progress */}
            <div className="flex items-center gap-1.5 mb-8">
              {steps.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? "bg-accent" : "bg-[rgba(255,255,255,0.08)]"}`} />
              ))}
            </div>
            <StepBody
              step={steps[stepIdx]}
              onContinue={() => setStepIdx(i => i + 1)}
              onSkip={() => setStepIdx(i => i + 1)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Individual step bodies ────────────────────────────────────
function StepBody({ step, onContinue, onSkip }: { step: StepId; onContinue: () => void; onSkip: () => void }) {
  if (step === "pin")    return <PinStep onContinue={onContinue} onSkip={onSkip} />;
  if (step === "alfred") return <StepFrame icon={Sparkles} title="Make Alfred yours" sub="This is your AI's identity — who it is, how it talks, what it knows about you. Edit it now or leave the template and refine later." onContinue={onContinue} onSkip={onSkip} skipLabel="Use the template"><SvGptEditor /></StepFrame>;
  if (step === "totp")   return <StepFrame icon={Smartphone} title="Two-factor auth" sub="Add a TOTP code from your authenticator app as a second factor." onContinue={onContinue} onSkip={onSkip}><TotpSetup onComplete={onContinue} /></StepFrame>;
  if (step === "passkey") return <StepFrame icon={KeyRound} title="Add a passkey" sub="Touch ID / Face ID / security key — the strongest, phishing-proof factor." onContinue={onContinue} onSkip={onSkip}><PasskeySetup /></StepFrame>;
  if (step === "push")   return <StepFrame icon={Bell} title="Push notifications" sub="Get the morning brief, security alerts, and reminders on your devices." onContinue={onContinue} onSkip={onSkip}><PushSetup /></StepFrame>;
  if (step === "finance") return <FinanceInfoStep onContinue={onContinue} onSkip={onSkip} />;
  if (step === "autonomy") return <AutonomyStep onContinue={onContinue} onSkip={onSkip} />;
  return null;
}

function StepFrame({ icon: Icon, title, sub, children, onContinue, onSkip, skipLabel = "Skip" }: {
  icon: any; title: string; sub: string; children: React.ReactNode;
  onContinue: () => void; onSkip: () => void; skipLabel?: string;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-2.5 mb-2">
        <Icon size={20} className="text-accent" />
        <h2 className="text-[22px] font-700 tracking-tight">{title}</h2>
      </div>
      <p className="text-[13px] text-text-3 leading-relaxed mb-6">{sub}</p>
      <div className="flex-1">{children}</div>
      <div className="flex items-center gap-3 mt-8 pt-4 border-t border-border-dim">
        <Button variant="primary" size="lg" className="flex-1" onClick={onContinue}>Continue</Button>
        <Button variant="ghost" size="lg" onClick={onSkip}>{skipLabel}</Button>
      </div>
    </div>
  );
}

function PinStep({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr("");
    if (pin.length < 4) { setErr("PIN must be at least 4 digits"); return; }
    if (pin !== confirm) { setErr("PINs don't match"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/auth/pin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Couldn't set PIN");
      onContinue();
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't set PIN");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-2.5 mb-2">
        <Lock size={20} className="text-accent" />
        <h2 className="text-[22px] font-700 tracking-tight">Set a PIN</h2>
      </div>
      <p className="text-[13px] text-text-3 leading-relaxed mb-6">
        A quick lock on top of your login — used for the idle-lock and as a factor for the finance vault. Recommended, but you can skip it.
      </p>
      <div className="flex flex-col gap-3">
        <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="New PIN (4+ digits)" maxLength={12} className="w-full px-4 py-3 text-[15px] tabular-nums" />
        <input type="password" inputMode="numeric" value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, ""))}
          placeholder="Confirm PIN" maxLength={12} className="w-full px-4 py-3 text-[15px] tabular-nums" />
        {err && <p className="text-[12px] text-danger">{err}</p>}
      </div>
      <div className="flex items-center gap-3 mt-8 pt-4 border-t border-border-dim">
        <Button variant="primary" size="lg" className="flex-1" loading={saving} onClick={save}>Set PIN &amp; continue</Button>
        <Button variant="ghost" size="lg" onClick={onSkip}>Skip</Button>
      </div>
    </div>
  );
}

function FinanceInfoStep({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  return (
    <StepFrame icon={Shield} title="Finance vault" sub="Your finances sit behind a separate vault that needs your PIN + 2FA + passkey to open — so even a stolen session can't see your money. There's nothing to set up now; unlock it anytime in Finances." onContinue={onContinue} onSkip={onSkip} skipLabel="Skip">
      <div className="glass-1 rounded-[12px] p-4 flex items-start gap-3">
        <Check size={16} className="text-success mt-0.5 flex-shrink-0" />
        <p className="text-[12px] text-text-2 leading-relaxed">
          You&apos;re all set — the vault activates automatically once you&apos;ve added a PIN, 2FA, and a passkey above. Import bank CSVs and unlock it on the Finances page whenever you need it.
        </p>
      </div>
    </StepFrame>
  );
}

function AutonomyStep({ onContinue, onSkip }: { onContinue: () => void; onSkip: () => void }) {
  // Everyday examples first — buyers need to picture the impact, not the jargon.
  const examples = [
    "A meeting moves to the afternoon → Alfred reshuffles your morning and leaves you a note.",
    "You ship something → it drafts a video idea about it, sitting in your content pipeline by morning.",
    "It notices you've journaled 12 days straight → it remembers, so it can bring it up later.",
  ];
  return (
    <StepFrame
      icon={Bot}
      title="Alfred can run on its own"
      sub="Beyond answering you, Alfred can quietly handle small things in the background during its daily passes. It's OFF until you turn it on — here's what it looks like when you do."
      onContinue={onContinue}
      onSkip={onSkip}
      skipLabel="Maybe later"
    >
      <div className="flex flex-col gap-2">
        {examples.map((e, i) => (
          <div key={i} className="glass-1 rounded-[12px] p-3 flex items-start gap-2.5">
            <Sparkles size={14} className="text-accent mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-text-2 leading-relaxed">{e}</p>
          </div>
        ))}
        <div className="rounded-[12px] p-3 flex items-start gap-2.5 border border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.04)]">
          <Shield size={14} className="text-success mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-text-2 leading-relaxed">
            You stay in control: it only does small, reversible things on its own — every action shows up in <span className="text-text-1 font-600">Activity</span> with an <span className="text-text-1 font-600">Undo</span>. Anything that would send or post a message <span className="text-text-1 font-600">waits for your tap</span>, and it can <span className="text-text-1 font-600">never move money</span>. Turn it on anytime in Settings.
          </p>
        </div>
      </div>
    </StepFrame>
  );
}

function DoneScreen({ tier, finishing, onFinish }: { tier: Tier; finishing: boolean; onFinish: () => void }) {
  const next = tier === "quick" ? "Full" : tier === "full" ? "Power" : null;
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center animate-fade-up">
      <div className="w-16 h-16 rounded-[20px] bg-success/10 border border-success/30 flex items-center justify-center mb-5">
        <Check size={30} className="text-success" />
      </div>
      <h1 className="text-[26px] font-700 tracking-tight mb-2">You&apos;re in.</h1>
      <p className="text-[13px] text-text-3 leading-relaxed max-w-xs mb-2">
        {config.brand.name} is ready. Everything you skipped is one click away in Settings.
      </p>
      {next && (
        <p className="text-[12px] text-text-3 mb-7">
          Want more? Complete the <span className="text-accent font-600">{next}</span> tier anytime in Settings → Health.
        </p>
      )}
      <Button variant="primary" size="lg" className="w-full max-w-xs" loading={finishing} onClick={onFinish}>
        Enter {config.brand.shortName}
      </Button>
    </div>
  );
}
