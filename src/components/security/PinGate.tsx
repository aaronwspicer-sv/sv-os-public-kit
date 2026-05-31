"use client";
import { useState, useEffect, useCallback } from "react";
import { Lock, Delete, ArrowRight } from "lucide-react";

const SESSION_KEY = "spicer_os_pin_unlocked";
const TIMEOUT_MS  = 10 * 60 * 1000; // 10 minutes

function isUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < TIMEOUT_MS;
  } catch { return false; }
}

function markUnlocked() {
  try { sessionStorage.setItem(SESSION_KEY, String(Date.now())); } catch {}
}

function clearUnlocked() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

interface PinGateProps {
  children: React.ReactNode;
  label?: string;
}

export function PinGate({ children, label = "Spicer OS" }: PinGateProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());
  const [checked, setChecked]   = useState(false);
  const [pin, setPin]           = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [shake, setShake]       = useState(false);

  useEffect(() => {
    setChecked(true);
    const interval = setInterval(() => {
      if (!isUnlocked()) setUnlocked(false);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleDigit = useCallback((d: string) => {
    setPin(prev => prev.length < 8 ? prev + d : prev);
    setError("");
  }, []);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", pin }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        markUnlocked();
        setUnlocked(true);
        setPin("");
      } else {
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        if (data.locked) {
          setError(data.error);
        } else {
          setError(data.attemptsLeft != null
            ? `Incorrect PIN — ${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? "" : "s"} left`
            : "Incorrect PIN");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [pin]);

  // Keyboard support
  useEffect(() => {
    if (unlocked) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleDigit(e.key);
      else if (e.key === "Backspace") handleDelete();
      else if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [unlocked, handleDigit, handleDelete, handleSubmit]);

  if (!checked) return null;
  if (unlocked) return <>{children}</>;

  const dots = Array.from({ length: 8 }, (_, i) => (
    <div
      key={i}
      className={`rounded-full transition-all duration-200 ease-[var(--ease-spring)] ${
        i < pin.length
          ? "w-2.5 h-2.5 bg-accent shadow-[0_0_8px_rgba(29,155,240,0.6)]"
          : "w-2 h-2 bg-[rgba(255,255,255,0.12)]"
      }`}
    />
  ));

  const pad = ["1","2","3","4","5","6","7","8","9","","0","⌫"] as const;

  return (
    <div
      className="fixed inset-0 z-50 bg-canvas overflow-y-auto overscroll-contain"
      style={{ animation: "fade-in 0.2s var(--ease-glide) both" }}
    >
      {/* Accent glow background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent opacity-[0.04] blur-[140px]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-[#a78bfa] opacity-[0.03] blur-[140px]" />
      </div>

      {/* Scrollable centered content — min-h-screen flex centers, but overflow-y-auto on parent handles short viewports */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-8">
        <div
          className={`w-full max-w-[340px] flex flex-col items-center gap-5 ${shake ? "animate-shake" : ""}`}
        >
          {/* Icon */}
          <div className="w-14 h-14 rounded-[18px] glass-2 flex items-center justify-center"
               style={{ boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.12), 0 0 24px rgba(29,155,240,0.18)" }}>
            <Lock size={20} className="text-accent" />
          </div>

          {/* Header */}
          <div className="text-center flex flex-col gap-1">
            <h1 className="text-[19px] font-700 tracking-tight text-text-1">{label}</h1>
            <p className="text-[12px] text-text-3">Enter your PIN to continue</p>
          </div>

          {/* Dots — centered + spaced */}
          <div className="flex items-center justify-center gap-2.5 h-4 my-1">
            {dots}
          </div>

          {/* Error (reserved height to avoid layout shift) */}
          <div className="h-4 flex items-center">
            {error && (
              <p className="text-[12px] text-danger text-center animate-fade-up">{error}</p>
            )}
          </div>

          {/* Numpad — compact glass keys */}
          <div className="grid grid-cols-3 gap-2.5 w-full">
            {pad.map((key, i) => (
              key === "" ? (
                <div key={i} />
              ) : key === "⌫" ? (
                <button
                  key={i}
                  onClick={handleDelete}
                  aria-label="Delete"
                  className="h-[58px] rounded-[14px] glass-1 flex items-center justify-center text-text-2
                    transition-all duration-150 ease-[var(--ease-glide)]
                    hover:bg-[rgba(255,255,255,0.08)] hover:text-text-1
                    active:scale-95 active:bg-[rgba(255,255,255,0.12)]"
                >
                  <Delete size={18} />
                </button>
              ) : (
                <button
                  key={i}
                  onClick={() => handleDigit(key)}
                  className="h-[58px] rounded-[14px] glass-1 text-[22px] font-600 text-text-1 tabular-nums font-mono
                    transition-all duration-150 ease-[var(--ease-glide)]
                    hover:bg-[rgba(255,255,255,0.08)] hover:border-[rgba(29,155,240,0.2)]
                    active:scale-95 active:bg-[rgba(29,155,240,0.12)]"
                >
                  {key}
                </button>
              )
            ))}
          </div>

          {/* Submit — only shows when at least 4 digits entered */}
          <button
            onClick={handleSubmit}
            disabled={pin.length < 4 || loading}
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
              <>Unlock <ArrowRight size={14} /></>
            )}
          </button>
        </div>
      </div>

    </div>
  );
}

/** Call this to lock immediately (e.g., when navigating away from finances) */
export function lockPinGate() {
  clearUnlocked();
}
