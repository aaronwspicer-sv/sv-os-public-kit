"use client";
// Panic switch — disables ALL Alfred endpoints with a single click.
// When disabled: chat, voice, tools, transcribe, tts, realtime all return 503.
// Skill editor + memory editor stay accessible so you can fix him before re-enabling.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Power, AlertTriangle } from "lucide-react";

interface State {
  disabled: boolean;
  reason: string | null;
  at: string | null;
}

export function AlfredKillSwitch() {
  const [state, setState]   = useState<State | null>(null);
  const [busy, setBusy]     = useState(false);
  const [reason, setReason] = useState("");

  async function refresh() {
    const r = await fetch("/api/alfred/kill-switch");
    setState(await r.json());
  }
  useEffect(() => { refresh(); }, []);

  async function flip(disabled: boolean) {
    const msg = disabled
      ? "Disable Alfred? Chat, voice, tools — all will return 503 until you re-enable."
      : "Re-enable Alfred?";
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await fetch("/api/alfred/kill-switch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled, reason: disabled ? (reason.trim() || null) : null }),
      });
      await refresh();
      if (!disabled) setReason("");
    } finally { setBusy(false); }
  }

  if (!state) return <Card><p className="text-text-3 text-[12px]">Loading…</p></Card>;

  return (
    <Card className={`flex flex-col gap-4 ${state.disabled ? "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.04)]" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 border ${
          state.disabled
            ? "bg-[rgba(239,68,68,0.10)] border-[rgba(239,68,68,0.30)]"
            : "bg-[rgba(255,255,255,0.04)] border-border-dim"
        }`}>
          {state.disabled
            ? <AlertTriangle size={18} className="text-danger animate-pulse" />
            : <Power size={18} className="text-text-2" />}
        </div>
        <div className="flex-1">
          <p className={`text-[14px] font-600 ${state.disabled ? "text-danger" : "text-text-1"}`}>
            {state.disabled ? "Alfred is DISABLED" : "Alfred kill switch"}
          </p>
          <p className="text-[11px] text-text-3 mt-0.5">
            {state.disabled
              ? "Every Alfred endpoint returns 503 right now. Investigate, then re-enable."
              : "Panic button — instantly disable Alfred (chat, voice, all tools) without affecting the rest of the OS."}
          </p>
          {state.disabled && state.reason && (
            <p className="text-[11px] text-warning mt-2 italic">Reason: {state.reason}</p>
          )}
          {state.disabled && state.at && (
            <p className="text-[10px] text-text-3 mt-1 font-mono">Disabled at {new Date(state.at).toLocaleString()}</p>
          )}
        </div>
      </div>

      {!state.disabled && (
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (optional — for audit trail)"
          maxLength={300}
          className="w-full px-3 py-2 text-[12px]"
        />
      )}

      <Button
        variant={state.disabled ? "primary" : "danger"}
        onClick={() => flip(!state.disabled)}
        loading={busy}
        className="w-full"
      >
        <Power size={14} />
        {state.disabled ? "Re-enable Alfred" : "Disable Alfred (panic)"}
      </Button>
    </Card>
  );
}
