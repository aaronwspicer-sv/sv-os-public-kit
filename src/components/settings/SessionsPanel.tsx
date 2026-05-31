"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Monitor, LogOut, MapPin } from "lucide-react";

interface Session {
  id: string;
  device_id: string;
  device_label: string | null;
  ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  isCurrent: boolean;
}

function locStr(s: Session): string {
  return [s.city, s.region, s.country].filter(Boolean).join(", ") || s.ip || "Unknown";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1)   return "just now";
  if (min < 60)  return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);

  async function refresh() {
    const r = await fetch("/api/auth/sessions");
    const d = await r.json();
    setSessions(d.sessions ?? []);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function revoke(id: string, label: string | null) {
    if (!confirm(`Sign out ${label ?? "this device"}? They'll be kicked on next ping.`)) return;
    setBusy(true);
    try {
      await fetch("/api/auth/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  async function revokeOthers() {
    if (!confirm("Sign out every other device? Your current device stays signed in.")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeOthers: true }),
      });
      await refresh();
    } finally { setBusy(false); }
  }

  const active = sessions.filter(s => !s.revoked_at);
  const revoked = sessions.filter(s =>  s.revoked_at).slice(0, 5);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(52,211,153,0.10)] border border-[rgba(52,211,153,0.22)] flex items-center justify-center flex-shrink-0">
          <Monitor size={18} className="text-success" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Active sessions</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            Every device currently signed in. Revoke any of them remotely. New devices fire an alert.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-text-3 italic">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-[11px] text-text-3 italic">No active sessions yet (this one is being recorded now).</p>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map(s => (
            <div key={s.id} className={`flex items-center gap-3 p-3 rounded-[12px] border ${
              s.isCurrent
                ? "bg-accent-dim border-[rgba(29,155,240,0.28)]"
                : "bg-[rgba(255,255,255,0.03)] border-border-dim"
            }`}>
              <Monitor size={14} className={s.isCurrent ? "text-accent" : "text-text-3"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[12px] font-600 text-text-1">{s.device_label ?? "Unknown device"}</p>
                  {s.isCurrent && <span className="text-[9px] uppercase tracking-widest text-accent font-700">This device</span>}
                </div>
                <p className="text-[10px] text-text-3 flex items-center gap-1 flex-wrap">
                  <MapPin size={10} /> {locStr(s)} · last active {timeAgo(s.last_seen_at)}
                </p>
              </div>
              {!s.isCurrent && (
                <button
                  onClick={() => revoke(s.id, s.device_label)}
                  disabled={busy}
                  className="text-[11px] font-600 text-danger hover:underline disabled:opacity-40"
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {active.some(s => !s.isCurrent) && (
        <Button variant="danger" onClick={revokeOthers} loading={busy} className="w-full">
          <LogOut size={14} /> Sign out everywhere else
        </Button>
      )}

      {revoked.length > 0 && (
        <div className="flex flex-col gap-1 pt-2 border-t border-border-dim">
          <p className="text-[10px] uppercase tracking-[0.14em] text-text-3 font-600">Recently revoked</p>
          {revoked.map(s => (
            <p key={s.id} className="text-[10px] text-text-3 truncate">
              {s.device_label ?? "Unknown"} · {locStr(s)} · revoked {timeAgo(s.revoked_at!)}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
