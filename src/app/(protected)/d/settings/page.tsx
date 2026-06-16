"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TotpSetup } from "@/components/security/TotpSetup";
import { PasskeySetup } from "@/components/security/PasskeySetup";
import { PushSetup } from "@/components/security/PushSetup";
import { SecurityPanel } from "@/components/security/SecurityPanel";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { IdleLockSetting } from "@/components/settings/IdleLockSetting";
import { SessionsPanel } from "@/components/settings/SessionsPanel";
import { BriefingPreview } from "@/components/settings/BriefingPreview";
import { ReconcileReminder } from "@/components/settings/ReconcileReminder";
import { config } from "@/config";
import { PublicProfileSettings } from "@/components/settings/PublicProfileSettings";
import { SvGptEditor } from "@/components/settings/SvGptEditor";
import { AlfredMemories } from "@/components/settings/AlfredMemories";
import { AlfredKillSwitch } from "@/components/settings/AlfredKillSwitch";
import { AlfredAutonomyToggle } from "@/components/settings/AlfredAutonomyToggle";
import { WakeWordSetting } from "@/components/settings/WakeWordSetting";
import { CalendarFeeds } from "@/components/settings/CalendarFeeds";
import { Shield, Key, Lock, Bell, History, ChevronDown, ChevronUp, User, Fingerprint, Activity, ChevronRight, EyeOff, Compass } from "lucide-react";
import Link from "next/link";
import { useDemoMode } from "@/components/ui/DemoModeContext";

type Section = "pin" | "totp" | "passkey" | "push" | "audit" | "profile" | null;

export default function SettingsPage() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const [open, setOpen] = useState<Section>(null);
  const toggle = (s: Section) => setOpen(prev => prev === s ? null : s);

  // PIN setup state
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin]               = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError]     = useState("");
  const [pinSaved, setPinSaved]     = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinExists, setPinExists]   = useState(false);

  // Live security status for the overview tiles
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/pin").then(r => r.json()).then(d => setPinExists(!!d.exists)).catch(() => {}),
      fetch("/api/auth/totp").then(r => r.json()).then(d => setTotpEnabled(!!d.alreadyEnabled)).catch(() => setTotpEnabled(false)),
    ]).finally(() => setStatusLoaded(true));
  }, [pinSaved]); // re-poll when a PIN is just saved

  async function handleSavePin() {
    setPinError("");
    if (pin.length < 4) { setPinError("PIN must be at least 4 digits"); return; }
    if (pin !== pinConfirm) { setPinError("PINs don't match"); return; }
    if (pinExists && currentPin.length < 4) { setPinError("Enter your current PIN first"); return; }
    setPinLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup", pin, currentPin: pinExists ? currentPin : undefined }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setPinSaved(true);
        setPin(""); setPinConfirm(""); setCurrentPin("");
        setPinExists(true);
        setTimeout(() => setPinSaved(false), 3000);
      } else if (data.requiresCurrent) {
        setPinExists(true);
        setPinError("Enter your current PIN to change it");
      } else {
        setPinError(data.error ?? "Failed to save PIN");
      }
    } finally {
      setPinLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up stagger-1">
        <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Settings</p>
        <h1 className="text-[24px] font-700 tracking-tight">Security &amp; Appearance</h1>
      </div>

      {/* OS Health — quick link to /d/settings/health */}
      <Link href="/d/settings/health" className="animate-fade-up stagger-2 block">
        <Card interactive className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[rgba(29,155,240,0.10)] border border-[rgba(29,155,240,0.22)] flex items-center justify-center flex-shrink-0">
            <Activity size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-600 text-text-1">OS Health</p>
            <p className="text-[11px] text-text-3 mt-0.5">Cron status, setup validation, install hint</p>
          </div>
          <ChevronRight size={16} className="text-text-3" />
        </Card>
      </Link>

      {/* Replay the Alfred-guided walkthrough */}
      <div className="animate-fade-up stagger-2">
        <button
          onClick={() => { try { window.dispatchEvent(new Event("os:replay-tour")); } catch {} }}
          className="w-full"
        >
          <Card interactive className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[rgba(29,155,240,0.10)] border border-[rgba(29,155,240,0.22)] flex items-center justify-center flex-shrink-0">
              <Compass size={18} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[14px] font-600 text-text-1">Replay walkthrough</p>
              <p className="text-[11px] text-text-3 mt-0.5">Have Alfred tour the OS again</p>
            </div>
            <ChevronRight size={16} className="text-text-3" />
          </Card>
        </button>
      </div>

      {/* Theme */}
      <div className="animate-fade-up stagger-2">
        <ThemeToggle />
      </div>

      {/* Idle auto-lock */}
      <div className="animate-fade-up stagger-2">
        <IdleLockSetting />
      </div>

      {/* Demo Mode */}
      <div className="animate-fade-up stagger-2">
        <button
          onClick={toggleDemoMode}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] bg-card border border-border-dim hover:border-border transition-all"
        >
          <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0 transition-all ${isDemoMode ? "bg-[rgba(251,146,60,0.15)] border border-[rgba(251,146,60,0.35)]" : "bg-[rgba(255,255,255,0.04)] border border-border-dim"}`}>
            <EyeOff size={16} className={isDemoMode ? "text-orange-400" : "text-text-3"} />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Demo Mode</p>
            <p className="text-[11px] text-text-3">Hide real financial data for screenshots & recordings · ⌘⇧D</p>
          </div>
          <div className={`w-10 h-6 rounded-full transition-all flex items-center px-0.5 ${isDemoMode ? "bg-orange-400" : "bg-[rgba(255,255,255,0.1)]"}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${isDemoMode ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </button>
      </div>

      {/* Overview */}
      <div className="animate-fade-up stagger-2">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.2)] flex items-center justify-center">
              <Shield size={16} className="text-accent" />
            </div>
            <div>
              <p className="text-[14px] font-600 text-text-1">Account Security</p>
              <p className="text-[11px] text-text-3">{config.brand.shortName} uses 3-factor protection</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "OAuth",    desc: "Google / Email",          ok: true },
              { label: "TOTP 2FA", desc: "Authenticator app",       ok: !!totpEnabled },
              { label: "PIN Gate", desc: "Cold open + Finances",    ok: !!pinExists },
            ].map(({ label, desc, ok }) => (
              <div key={label} className="flex flex-col gap-1 p-3 rounded-[12px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-600 text-text-2">{label}</span>
                  <Badge variant={!statusLoaded ? "muted" : ok ? "success" : "muted"} className="text-[9px] px-1.5 py-0">
                    {!statusLoaded ? "…" : ok ? "On" : "Off"}
                  </Badge>
                </div>
                <p className="text-[10px] text-text-3">{desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* PIN Setup */}
      <div className="animate-fade-up stagger-3">
        <button
          onClick={() => toggle("pin")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] bg-card border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-[rgba(251,191,36,0.1)] border border-[rgba(251,191,36,0.2)] flex items-center justify-center flex-shrink-0">
            <Key size={16} className="text-warning" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Set PIN</p>
            <p className="text-[11px] text-text-3">Required on app open and Finances access</p>
          </div>
          {open === "pin" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "pin" && (
          <div className="mt-2">
            <Card className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {pinExists && (
                  <div>
                    <label className="text-[12px] font-600 text-text-2 mb-1.5 block">Current PIN</label>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={currentPin}
                      onChange={(e) => { setCurrentPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                      placeholder="••••"
                      className="w-full px-3 py-2.5 text-[16px] font-600 font-mono tracking-[0.3em] text-center"
                    />
                  </div>
                )}
                <div>
                  <label className="text-[12px] font-600 text-text-2 mb-1.5 block">New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                    placeholder="••••"
                    className="w-full px-3 py-2.5 text-[16px] font-600 font-mono tracking-[0.3em] text-center"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-600 text-text-2 mb-1.5 block">Confirm New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pinConfirm}
                    onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                    placeholder="••••"
                    className="w-full px-3 py-2.5 text-[16px] font-600 font-mono tracking-[0.3em] text-center"
                  />
                </div>
              </div>
              {pinError && <p className="text-[12px] text-danger">{pinError}</p>}
              <Button
                variant="primary"
                onClick={handleSavePin}
                loading={pinLoading}
                className="w-full"
              >
                {pinSaved ? "✓ PIN Saved" : "Save PIN"}
              </Button>
              <p className="text-[11px] text-text-3 text-center">
                Stored as a bcrypt hash. Changing requires your current PIN.
                5 failed attempts triggers an escalating lockout (1 → 5 → 15 → 30 → 60 min).
              </p>
            </Card>
          </div>
        )}
      </div>

      {/* TOTP Setup */}
      <div className="animate-fade-up stagger-4">
        <button
          onClick={() => toggle("totp")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] bg-card border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.2)] flex items-center justify-center flex-shrink-0">
            <Lock size={16} className="text-accent" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Authenticator App (2FA)</p>
            <p className="text-[11px] text-text-3">Google Authenticator, Authy, or any TOTP app</p>
          </div>
          {open === "totp" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "totp" && (
          <div className="mt-2">
            <TotpSetup onComplete={() => setTimeout(() => toggle("totp"), 2000)} />
          </div>
        )}
      </div>

      {/* Passkeys / Biometrics */}
      <div className="animate-fade-up stagger-4">
        <button
          onClick={() => toggle("passkey")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] glass-1 border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
            <Fingerprint size={16} className="text-[#a78bfa]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Passkeys / Biometrics</p>
            <p className="text-[11px] text-text-3">Touch ID, Face ID, Chromebook unlock, security keys</p>
          </div>
          {open === "passkey" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "passkey" && (
          <div className="mt-2">
            <PasskeySetup />
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div className="animate-fade-up stagger-5">
        <button
          onClick={() => toggle("push")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] glass-1 border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-[rgba(167,139,250,0.10)] border border-[rgba(167,139,250,0.22)] flex items-center justify-center flex-shrink-0">
            <Bell size={16} className="text-[#a78bfa]" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Push Notifications</p>
            <p className="text-[11px] text-text-3">Fraud alerts, journal + task reminders</p>
          </div>
          {open === "push" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "push" && (
          <div className="mt-2">
            <PushSetup />
          </div>
        )}
      </div>

      {/* Public Profile */}
      <div className="animate-fade-up stagger-5">
        <button
          onClick={() => toggle("profile")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] glass-1 border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-[rgba(52,211,153,0.10)] border border-[rgba(52,211,153,0.22)] flex items-center justify-center flex-shrink-0">
            <User size={16} className="text-success" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Public Profile</p>
            <p className="text-[11px] text-text-3">Your /u/&lt;slug&gt; character sheet</p>
          </div>
          {open === "profile" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "profile" && (
          <div className="mt-2">
            {isDemoMode ? <DemoHidden label="Public profile" /> : <PublicProfileSettings />}
          </div>
        )}
      </div>

      {/* Active sessions */}
      <div className="animate-fade-up stagger-5">
        {isDemoMode ? <DemoHidden label="Active sessions" /> : <SessionsPanel />}
      </div>

      {/* Briefing emails — manual test buttons */}
      <div className="animate-fade-up stagger-5">
        {isDemoMode ? <DemoHidden label="Briefing preview" /> : <BriefingPreview />}
      </div>

      {/* Weekly reconcile reminder */}
      <div className="animate-fade-up stagger-5">
        <ReconcileReminder />
      </div>

      {/* SV-GPT skill editor — Alfred's identity */}
      <div className="animate-fade-up stagger-6">
        {isDemoMode ? <DemoHidden label="Alfred's identity (SV-GPT)" /> : <SvGptEditor />}
      </div>

      {/* Alfred kill switch — top of Alfred section so it's findable in emergencies */}
      <div className="animate-fade-up stagger-6">
        <AlfredKillSwitch />
      </div>

      {/* Autonomous Alfred opt-in */}
      <div className="animate-fade-up stagger-6">
        {isDemoMode ? <DemoHidden label="Autonomous Alfred" /> : <AlfredAutonomyToggle />}
      </div>

      {/* Alfred's long-term memory */}
      <div className="animate-fade-up stagger-6">
        {isDemoMode ? <DemoHidden label="Alfred's memories" /> : <AlfredMemories />}
      </div>

      {/* Wake word listener */}
      <div className="animate-fade-up stagger-6">
        <WakeWordSetting />
      </div>

      {/* Calendar feeds for Alfred */}
      <div className="animate-fade-up stagger-6">
        {isDemoMode ? <DemoHidden label="Calendar feeds" /> : <CalendarFeeds />}
      </div>

      {/* Security Panel — audit log, key rotation, break-glass */}
      <div className="animate-fade-up stagger-6">
        <button
          onClick={() => toggle("audit")}
          className="w-full flex items-center gap-3 p-4 rounded-[16px] glass-1 border border-border-dim hover:border-border transition-all"
        >
          <div className="w-9 h-9 rounded-[12px] bg-[rgba(239,68,68,0.10)] border border-[rgba(239,68,68,0.22)] flex items-center justify-center flex-shrink-0">
            <History size={16} className="text-danger" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-[14px] font-600 text-text-1">Audit Log & Defense</p>
            <p className="text-[11px] text-text-3">Activity history, key rotation, break-glass revoke</p>
          </div>
          {open === "audit" ? <ChevronUp size={16} className="text-text-3" /> : <ChevronDown size={16} className="text-text-3" />}
        </button>

        {open === "audit" && (
          <div className="mt-2">
            {isDemoMode ? <DemoHidden label="Audit log & defense" /> : <SecurityPanel />}
          </div>
        )}
      </div>
    </div>
  );
}

// Placeholder shown in place of a real-data panel while demo mode is on —
// keeps your sessions/profile/memories/audit private on camera.
function DemoHidden({ label }: { label: string }) {
  return (
    <div className="glass-1 rounded-[16px] border border-border-dim p-4 flex items-center gap-3">
      <EyeOff size={15} className="text-text-3 flex-shrink-0" />
      <p className="text-[12px] text-text-3">{label} is hidden while demo mode is on — your real data stays private.</p>
    </div>
  );
}
