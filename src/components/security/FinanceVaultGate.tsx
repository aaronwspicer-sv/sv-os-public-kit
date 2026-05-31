"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Vault, ShieldCheck, Lock, Unlock, Fingerprint } from "lucide-react";

interface FinanceVaultGateProps {
  children: React.ReactNode;
  label?: string;
}

type Phase = "checking" | "locked" | "unlocking" | "unlocked";

const TTL_SEC = 5 * 60;

export function FinanceVaultGate({ children, label = "Finance Vault" }: FinanceVaultGateProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pinRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/finance/status");
      const d = await r.json();
      if (d.unlocked) {
        setPhase("unlocked");
        setExpiresAt(d.expiresAt);
      } else {
        setPhase("locked");
        setExpiresAt(null);
      }
    } catch {
      setPhase("locked");
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  // Tick every second to show countdown
  useEffect(() => {
    if (phase !== "unlocked" || !expiresAt) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= expiresAt) {
        setPhase("locked");
        setExpiresAt(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, expiresAt]);

  useEffect(() => {
    if (phase === "locked") setTimeout(() => pinRef.current?.focus(), 50);
  }, [phase]);

  async function unlock(e?: React.FormEvent) {
    e?.preventDefault();
    if (pin.length < 4 || totp.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      // ── Step 1 — issue a passkey challenge for the vault ──
      const optsRes = await fetch("/api/finance/passkey-options", { method: "POST" });
      const optsData = await optsRes.json();
      if (!optsRes.ok) {
        setError(optsData.error ?? "Couldn't start passkey");
        return;
      }
      // ── Step 2 — biometric prompt (Touch ID / Face ID / Chromebook unlock) ──
      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: optsData });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? "");
        setError(/NotAllowedError|cancel/i.test(msg) ? "Cancelled" : (msg || "Biometric failed"));
        return;
      }
      // ── Step 3 — send all three factors atomically ──
      const r = await fetch("/api/finance/unlock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, totp, passkey: assertion }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setError(d.error ?? "Unlock failed");
        setPin("");
        setTotp("");
        return;
      }
      setExpiresAt(d.expiresAt);
      setPhase("unlocked");
      setPin("");
      setTotp("");
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function lockNow() {
    setBusy(true);
    try {
      await fetch("/api/finance/lock", { method: "POST" });
      setPhase("locked");
      setExpiresAt(null);
    } finally {
      setBusy(false);
    }
  }

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[13px] text-text-3 animate-pulse">Checking vault…</p>
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="flex flex-col gap-6 max-w-[440px] mx-auto pt-8">
        <div className="text-center flex flex-col items-center gap-3 animate-fade-up">
          <div className="w-16 h-16 rounded-[20px] glass-2 flex items-center justify-center"
               style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.12), 0 0 32px rgba(248,113,113,0.18)" }}>
            <Vault size={26} className="text-danger" />
          </div>
          <div>
            <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">{label}</p>
            <h1 className="text-[22px] font-700 tracking-tight">Locked</h1>
            <p className="text-text-3 text-[12px] mt-1">PIN + TOTP + Biometric all required. Auto-relocks after 5 min.</p>
          </div>
        </div>

        <Card className="flex flex-col gap-4 animate-fade-up stagger-2">
          <form onSubmit={unlock} className="flex flex-col gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">PIN</label>
              <input
                ref={pinRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(null); }}
                placeholder="••••"
                className="w-full px-4 py-3 text-[20px] font-700 font-mono tabular-nums tracking-[0.3em] text-center"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">TOTP code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totp}
                onChange={(e) => { setTotp(e.target.value.replace(/\D/g, "")); setError(null); }}
                placeholder="000 000"
                className="w-full px-4 py-3 text-[20px] font-700 font-mono tabular-nums tracking-[0.3em] text-center"
              />
            </div>
            {error && <p className="text-[12px] text-danger text-center">{error}</p>}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={busy}
              disabled={pin.length < 4 || totp.length !== 6}
              className="w-full"
            >
              <Fingerprint size={14} /> Unlock Vault (Biometric)
            </Button>
          </form>
          <p className="text-center text-[10px] text-text-3 leading-relaxed">
            🔒 PIN + TOTP + Biometric — all three required. Every failed attempt fires an alert.<br/>
            Vault uses a separate encryption key from the rest of the OS.
          </p>
        </Card>
      </div>
    );
  }

  // Unlocked
  const remainingMs = Math.max(0, (expiresAt ?? 0) - now);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const lowTime = remainingMs < 60_000;

  return (
    <div className="flex flex-col gap-4">
      <div className={`glass-1 rounded-[12px] px-3 py-2 flex items-center gap-2.5 ${lowTime ? "border-[rgba(251,191,36,0.32)]" : ""}`}>
        <ShieldCheck size={13} className={lowTime ? "text-warning" : "text-success"} />
        <span className="text-[11px] font-600 text-text-2">Vault unlocked · auto-locks in</span>
        <span className={`text-[11px] font-700 tabular-nums font-mono ${lowTime ? "text-warning" : "text-success"}`}>
          {remainingMin}:{String(remainingSec).padStart(2, "0")}
        </span>
        <button onClick={lockNow} disabled={busy} className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-3 hover:text-danger transition-colors">
          <Lock size={10} /> Lock now
        </button>
      </div>
      {children}
    </div>
  );
}
