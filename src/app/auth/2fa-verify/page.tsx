"use client";
import { useState, useEffect, useRef } from "react";
import { ShieldCheck, ArrowRight, Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { SvMark } from "@/components/SvMark";
import { createClient } from "@/lib/supabase/client";

export default function TwoFaVerifyPage() {
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/auth/2fa-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        setError(d.error ?? "Verification failed");
        setCode("");
        return;
      }
      // Hard nav so middleware re-runs and routes us through correctly
      window.location.href = "/d";
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPasskey() {
    setLoading(true); setError(null);
    try {
      const optsRes = await fetch("/api/auth/passkey/auth-options", { method: "POST" });
      if (optsRes.status === 404) {
        setError("No passkeys registered yet — add one in Settings");
        return;
      }
      if (!optsRes.ok) { setError("Couldn't start passkey auth"); return; }
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verRes = await fetch("/api/auth/passkey/auth-verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });
      const d = await verRes.json();
      if (!verRes.ok || !d.ok) { setError(d.error ?? "Passkey rejected"); return; }
      window.location.href = "/d";
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? "");
      if (/NotAllowedError|cancel/i.test(msg)) setError("Cancelled");
      else setError(msg || "Passkey failed");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent opacity-[0.05] rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col gap-6">
        <div className="text-center flex flex-col items-center gap-3" style={{ animation: "fade-up 0.5s var(--ease-glide) both" }}>
          <div className="rounded-[16px] animate-glow p-2"><SvMark size={72} /></div>
          <div>
            <h1 className="text-[22px] font-700 tracking-tight text-text-1 inline-flex items-center gap-2">
              <ShieldCheck size={18} className="text-accent" /> Two-Factor Required
            </h1>
            <p className="text-text-3 text-[12px] mt-1">Enter the 6-digit code from your authenticator app</p>
          </div>
        </div>

        <form onSubmit={verify} className="glass-2 rounded-[18px] p-6 flex flex-col gap-4"
              style={{ animation: "fade-up 0.6s var(--ease-glide) 0.15s both" }}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(null); }}
            placeholder="000 000"
            className="w-full px-4 py-3 text-[24px] font-700 tabular-nums font-mono text-center tracking-[0.3em]"
          />
          {error && <p className="text-[12px] text-danger text-center">{error}</p>}
          <button
            type="submit"
            disabled={code.length !== 6 || loading}
            className="w-full h-12 rounded-[14px]
              bg-gradient-to-b from-[#3eb0ff] to-[#1D9BF0] text-black font-600 text-[14px]
              shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_4px_14px_rgba(29,155,240,0.35)]
              hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_6px_20px_rgba(29,155,240,0.5)]
              active:scale-[0.98] transition-all duration-200 ease-[var(--ease-glide)]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
              inline-flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Verify <ArrowRight size={14} /></>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={verifyPasskey}
          disabled={loading}
          className="w-full h-11 rounded-[14px] glass-1 border border-border-dim hover:border-[rgba(167,139,250,0.4)] hover:bg-[rgba(167,139,250,0.06)] transition-all flex items-center justify-center gap-2 text-[13px] font-600 text-text-1 disabled:opacity-40"
        >
          <Fingerprint size={15} className="text-[#a78bfa]" />
          Use Touch ID / Face ID instead
        </button>

        <button
          onClick={signOut}
          className="text-center text-[11px] text-text-3 hover:text-danger transition-colors"
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
