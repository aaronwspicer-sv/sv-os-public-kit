"use client";
// The "what Alfred did" feed — every autonomous/assisted action, with Undo on
// reversible ones and Approve/Deny on pending outbound proposals. Used by the
// Alfred cockpit (/d/alfred). Self-contained: fetches + manages its own state.
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ShieldCheck, RefreshCw, Undo2, Check, X } from "lucide-react";

interface AlfredAction {
  id: string;
  tier: "green" | "amber" | "red";
  boundary: "internal" | "outbound";
  tool: string;
  summary: string | null;
  justification: string | null;
  tainted: boolean;
  origin: "chat" | "voice" | "autonomous" | "exec";
  status: "proposed" | "done" | "failed" | "denied" | "reversed";
  reversible: boolean;
  reversed: boolean;
  created_at: string;
}

const TIER_BADGE: Record<AlfredAction["tier"], "success" | "warning" | "danger"> = {
  green: "success", amber: "warning", red: "danger",
};
const TIER_LABEL: Record<AlfredAction["tier"], string> = {
  green: "auto", amber: "audited", red: "gated",
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function AlfredActivityFeed() {
  const [actions, setActions] = useState<AlfredAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/alfred/activity?limit=100", { cache: "no-store" });
      const d = await r.json();
      setActions(d.actions ?? []);
    } catch {
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const undo = useCallback(async (id: string) => {
    setBusy(id);
    try {
      await fetch("/api/alfred/activity/undo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: id }),
      });
      await load();
    } finally { setBusy(null); }
  }, [load]);

  const decide = useCallback(async (id: string, decision: "approve" | "deny") => {
    setBusy(id);
    try {
      const r = await fetch("/api/alfred/activity/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId: id, decision }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (d.reasons) alert(`Egress wall blocked it: ${d.reasons.join(", ")}. Edit before sending.`);
      }
      await load();
    } finally { setBusy(null); }
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-text-2">What I did</p>
        <button onClick={load} className="flex items-center gap-1.5 text-[12px] text-text-3 hover:text-text-1 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading && actions.length === 0 ? (
        <Card><div className="text-text-3 text-[13px]">Loading…</div></Card>
      ) : actions.length === 0 ? (
        <Card variant="highlight">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="text-accent shrink-0 mt-0.5" />
            <div>
              <div className="text-[14px] font-600">Nothing yet — the cage is live.</div>
              <div className="text-text-3 text-[13px] mt-1">
                Tier-classified, logged, and money movement is impossible by design. Once I start acting, every move shows up here.
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <ul className="divide-y divide-border-dim">
            {actions.map(a => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                  background: a.tier === "green" ? "#34d399" : a.tier === "amber" ? "#fbbf24" : "#f87171",
                }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-600 font-mono">{a.tool}</span>
                    <Badge variant={TIER_BADGE[a.tier]}>{TIER_LABEL[a.tier]}</Badge>
                    {a.origin === "autonomous" && <Badge variant="accent">autonomous</Badge>}
                    {a.tainted && <Badge variant="muted">external</Badge>}
                    {a.status === "proposed" && <Badge variant="warning">awaiting you</Badge>}
                    {a.status === "denied" && <Badge variant="muted">denied</Badge>}
                    {a.status === "failed" && <Badge variant="danger">failed</Badge>}
                    {a.reversed && <Badge variant="muted">reversed</Badge>}
                  </div>
                  {a.summary && <div className="text-text-2 text-[12px] mt-0.5 truncate">{a.summary}</div>}
                </div>
                {a.status === "proposed" ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => decide(a.id, "approve")} disabled={busy === a.id}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-[rgba(52,211,153,0.3)] text-success hover:bg-[rgba(52,211,153,0.1)] transition-colors disabled:opacity-50" title="Approve — this will send">
                      <Check size={12} /> Approve
                    </button>
                    <button onClick={() => decide(a.id, "deny")} disabled={busy === a.id}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border-dim text-text-2 hover:text-danger transition-colors disabled:opacity-50" title="Deny">
                      <X size={12} /> Deny
                    </button>
                  </div>
                ) : a.reversible && !a.reversed ? (
                  <button onClick={() => undo(a.id)} disabled={busy === a.id}
                    className="flex items-center gap-1 text-[11px] text-text-2 hover:text-danger transition-colors shrink-0 disabled:opacity-50" title="Undo this action">
                    <Undo2 size={12} /> {busy === a.id ? "…" : "Undo"}
                  </button>
                ) : null}
                <span className="text-text-3 text-[11px] shrink-0">{relTime(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
