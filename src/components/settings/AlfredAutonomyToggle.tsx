"use client";
// Master opt-in for Autonomous Alfred. When ON, Alfred's scheduled passes
// (morning/midday/evening) act on their own — green actions only, all logged to
// /d/activity. When OFF (default), the passes do nothing. Separate from the
// panic kill switch: this governs autonomy, that silences Alfred entirely.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Bot, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function AlfredAutonomyToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch("/api/alfred/autonomy");
    const d = await r.json();
    setEnabled(!!d.autonomy_enabled);
  }
  useEffect(() => { refresh(); }, []);

  async function flip(next: boolean) {
    const msg = next
      ? "Turn on Autonomous Alfred? It will take green actions on its own during scheduled passes. Everything is logged and reversible — and it can never move money."
      : "Stand Alfred down? Scheduled passes will stop acting on their own.";
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await fetch("/api/alfred/autonomy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  if (enabled === null) return <Card><p className="text-text-3 text-[12px]">Loading…</p></Card>;

  return (
    <Card className={`flex flex-col gap-4 ${enabled ? "border-[rgba(29,155,240,0.3)] bg-[rgba(29,155,240,0.04)]" : ""}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 border ${
          enabled ? "bg-[rgba(29,155,240,0.10)] border-[rgba(29,155,240,0.30)]" : "bg-[rgba(255,255,255,0.04)] border-border-dim"
        }`}>
          <Bot size={18} className={enabled ? "text-accent" : "text-text-2"} />
        </div>
        <div className="flex-1">
          <p className={`text-[14px] font-600 ${enabled ? "text-accent" : "text-text-1"}`}>
            {enabled ? "Autonomous Alfred is ON" : "Autonomous Alfred"}
          </p>
          <p className="text-[11px] text-text-3 mt-0.5">
            {enabled
              ? "Alfred acts on its own during scheduled passes — green actions only, all reversible and logged."
              : "Let Alfred act on its own during morning/midday/evening passes. Green-tier only — additive, reversible, and it can never move money."}
          </p>
          <p className="text-[11px] text-text-3 mt-2 flex items-center gap-1">
            <ShieldCheck size={12} className="text-success" />
            Review everything at <Link href="/d/activity" className="text-accent underline">/d/activity</Link>
          </p>
        </div>
      </div>

      <Button
        variant={enabled ? "outline" : "primary"}
        onClick={() => flip(!enabled)}
        loading={busy}
        className="w-full"
      >
        <Bot size={14} />
        {enabled ? "Stand Alfred down" : "Enable Autonomous Alfred"}
      </Button>
    </Card>
  );
}
