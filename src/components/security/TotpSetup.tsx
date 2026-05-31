"use client";
import { useState, useEffect } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ShieldCheck, Copy, Check } from "lucide-react";

type Step = "loading" | "scan" | "verify" | "done" | "error";

export function TotpSetup({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep]           = useState<Step>("loading");
  const [setupError, setSetupError] = useState("");
  const [qrCode, setQrCode]       = useState("");
  const [secret, setSecret]       = useState("");
  const [token, setToken]         = useState("");
  const [error, setError]         = useState("");
  const [copied, setCopied]       = useState(false);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    fetch("/api/auth/totp")
      .then(async r => {
        const data = await r.json();
        if (data.alreadyEnabled) {
          setStep("done");
          return;
        }
        if (r.ok && data.qrCode && data.secret) {
          setQrCode(data.qrCode);
          setSecret(data.secret);
          setStep("scan");
        } else {
          setSetupError(data.error ?? "Failed to generate 2FA setup");
          setStep("error");
        }
      })
      .catch(err => {
        setSetupError(err?.message ?? "Network error — check your connection");
        setStep("error");
      });
  }, []);

  async function handleDisable() {
    if (!confirm("Disable 2FA? You'll be able to set up a new authenticator after.")) return;
    setLoading(true);
    try {
      await fetch("/api/auth/totp", { method: "DELETE" });
      // Reload to fetch a fresh setup secret
      const r = await fetch("/api/auth/totp");
      const data = await r.json();
      if (r.ok && data.qrCode && data.secret) {
        setQrCode(data.qrCode);
        setSecret(data.secret);
        setToken("");
        setStep("scan");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleEnable() {
    if (token.length !== 6) { setError("Enter the 6-digit code from your app"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enable", token }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStep("done");
        onComplete?.();
      } else {
        setError(data.error ?? "Invalid code — try again");
        setToken("");
      }
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (step === "loading") {
    return (
      <Card className="flex flex-col items-center gap-4 py-8">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        <p className="text-[12px] text-text-3">Generating 2FA code…</p>
      </Card>
    );
  }

  if (step === "error") {
    return (
      <Card className="text-center py-8 flex flex-col gap-3">
        <p className="text-[13px] text-danger font-600">Failed to generate 2FA setup</p>
        {setupError && (
          <p className="text-[11px] text-text-3 font-mono px-4 py-2 bg-[rgba(248,113,113,0.06)] rounded-[8px] break-all">
            {setupError}
          </p>
        )}
        <p className="text-[11px] text-text-3">Check your server logs for details.</p>
      </Card>
    );
  }

  if (step === "done") {
    return (
      <Card className="flex flex-col items-center gap-4 py-8">
        <div className="w-14 h-14 rounded-[18px] bg-[rgba(52,211,153,0.1)] border border-[rgba(52,211,153,0.2)] flex items-center justify-center">
          <ShieldCheck size={24} className="text-success" />
        </div>
        <div className="text-center">
          <p className="text-[16px] font-700 text-text-1">2FA Enabled</p>
          <p className="text-[12px] text-text-3 mt-1">Your account is protected with authenticator app 2FA.</p>
        </div>
        <Badge variant="success">Active</Badge>
        <button
          onClick={handleDisable}
          disabled={loading}
          className="text-[11px] text-text-3 hover:text-danger transition-colors underline-offset-2 hover:underline disabled:opacity-50"
        >
          {loading ? "Working…" : "Disable & re-setup"}
        </button>
      </Card>
    );
  }

  // scan + verify
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.2)] flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-accent" />
        </div>
        <div>
          <CardTitle>Set up Two-Factor Auth</CardTitle>
          <p className="text-[11px] text-text-3 mt-0.5">Scan with Google Authenticator or Authy</p>
        </div>
      </div>

      {/* Step 1 — QR */}
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-600 text-text-2 uppercase tracking-wider">Step 1 — Scan QR code</p>
        {qrCode && (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="TOTP QR code" className="w-[180px] h-[180px] rounded-[12px] bg-white p-2" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-mono text-text-3 flex-1 truncate bg-[rgba(255,255,255,0.04)] px-3 py-1.5 rounded-[8px]">
            {secret}
          </p>
          <button
            onClick={copySecret}
            className="p-2 rounded-[8px] border border-border-dim hover:border-accent text-text-3 hover:text-accent transition-all flex-shrink-0"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-[11px] text-text-3">Can&apos;t scan? Enter the key manually in your app.</p>
      </div>

      <div className="h-px bg-border-dim" />

      {/* Step 2 — Verify */}
      <div className="flex flex-col gap-3">
        <p className="text-[12px] font-600 text-text-2 uppercase tracking-wider">Step 2 — Confirm code</p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={token}
          onChange={(e) => { setToken(e.target.value.replace(/\D/g, "")); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleEnable()}
          placeholder="000 000"
          className="w-full px-4 py-3 text-[24px] font-700 tabular-nums font-mono text-center tracking-[0.3em]"
        />
        {error && <p className="text-[12px] text-danger text-center">{error}</p>}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleEnable}
          loading={loading}
          disabled={token.length !== 6}
        >
          Enable 2FA
        </Button>
      </div>
    </Card>
  );
}
