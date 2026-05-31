"use client";
// Manual-trigger buttons for the morning brief + evening recap emails.
// Hits the same routes Vercel cron does (POST, owner-authed alternative).
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Mail, Sunrise, Moon, Sparkles } from "lucide-react";

type Slot = "morning" | "evening" | "review";

export function BriefingPreview() {
  const [busy, setBusy]   = useState<Slot | null>(null);
  const [status, setStatus] = useState<{ slot: Slot; msg: string; ok: boolean } | null>(null);

  async function send(slot: Slot) {
    setBusy(slot); setStatus(null);
    try {
      const url =
        slot === "morning" ? "/api/cron/morning-brief" :
        slot === "evening" ? "/api/cron/evening-recap" :
        "/api/alfred/review";
      const r = await fetch(url, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setStatus({
          slot,
          ok: true,
          msg: slot === "review"
            ? "✓ Alfred review generated — see chat (also saved to memory)"
            : "✓ Sent — check your inbox in a few seconds",
        });
      } else {
        setStatus({ slot, ok: false, msg: d.error ?? `Failed (${r.status})` });
      }
    } catch (e: any) {
      setStatus({ slot, ok: false, msg: e?.message ?? "Network error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(29,155,240,0.10)] border border-[rgba(29,155,240,0.22)] flex items-center justify-center flex-shrink-0">
          <Mail size={18} className="text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Briefing emails</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            Morning brief at 7am, evening recap at 9pm (Toronto). Tap to send one to yourself now to preview.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={() => send("morning")}
          loading={busy === "morning"}
          disabled={busy !== null}
          className="w-full"
        >
          <Sunrise size={14} /> Send morning brief
        </Button>
        <Button
          variant="outline"
          onClick={() => send("evening")}
          loading={busy === "evening"}
          disabled={busy !== null}
          className="w-full"
        >
          <Moon size={14} /> Send evening recap
        </Button>
      </div>
      <Button
        variant="primary"
        onClick={() => send("review")}
        loading={busy === "review"}
        disabled={busy !== null}
        className="w-full"
      >
        <Sparkles size={14} /> Run Alfred's coach review now
      </Button>

      {status && (
        <p className={`text-[11px] text-center ${status.ok ? "text-success" : "text-danger"}`}>
          {status.slot === "morning" ? "Morning: " : "Evening: "}{status.msg}
        </p>
      )}
    </Card>
  );
}
