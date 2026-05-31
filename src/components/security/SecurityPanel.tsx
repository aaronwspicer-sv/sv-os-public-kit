"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/ToastProvider";
import { AlertTriangle, Shield, RefreshCw, KeyRound, X, History } from "lucide-react";
import { AuditIntegrity } from "@/components/security/AuditIntegrity";

interface AuditEvent {
  id: number;
  action: string;
  metadata: any;
  created_at: string;
  user_id: string | null;
}

const ACTION_STYLE: Record<string, { color: string; label: string }> = {
  login_success:             { color: "#34d399", label: "Login" },
  logout:                    { color: "#94a3b8", label: "Logout" },
  unauthorized_login_attempt:{ color: "#ef4444", label: "🚨 Intrusion" },
  pin_fail:                  { color: "#fbbf24", label: "PIN fail" },
  pin_success:               { color: "#34d399", label: "PIN ok" },
  pin_change_fail:           { color: "#fbbf24", label: "PIN change fail" },
  pin_created:               { color: "#1D9BF0", label: "PIN created" },
  pin_changed:               { color: "#1D9BF0", label: "PIN changed" },
  "2fa_pass":                { color: "#34d399", label: "2FA passed" },
  "2fa_fail":                { color: "#ef4444", label: "2FA fail" },
  totp_enabled:              { color: "#1D9BF0", label: "2FA enabled" },
  totp_disabled:             { color: "#fbbf24", label: "2FA disabled" },
  plaid_link:                { color: "#1D9BF0", label: "Plaid link" },
  plaid_disconnect:          { color: "#fbbf24", label: "Plaid disconnect" },
  plaid_confirm:             { color: "#94a3b8", label: "Tx confirmed" },
  key_rotation:              { color: "#a78bfa", label: "🔑 Key rotation" },
  break_glass_revoke:        { color: "#ef4444", label: "🚨 Break-glass" },
};

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function SecurityPanel() {
  const toast = useToast();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [filter, setFilter] = useState<"all"|"fails"|"intrusion"|"logins">("all");
  const [rotateBusy, setRotateBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/security/audit?limit=100");
    const d = await r.json();
    if (d.events) setEvents(d.events);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (events ?? []).filter(e => {
    if (filter === "all")        return true;
    if (filter === "fails")      return e.action.includes("fail") || e.action.includes("attempt");
    if (filter === "intrusion")  return e.action === "unauthorized_login_attempt";
    if (filter === "logins")     return e.action === "login_success" || e.action === "logout";
    return true;
  });

  async function rotateKeys() {
    setRotateBusy(true);
    try {
      const r = await fetch("/api/security/rotate-keys", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      toast.success(
        `Re-encrypted ${d.migrated} row(s)`,
        `Skipped ${d.skipped} already at v${d.activeVersion}${d.failures?.length ? ` · ${d.failures.length} failures` : ""}`,
      );
      load();
    } catch (e: any) {
      toast.error("Key rotation failed", e?.message);
    } finally {
      setRotateBusy(false);
    }
  }

  async function breakGlass() {
    setRevokeBusy(true);
    try {
      await fetch("/api/security/revoke-all", { method: "POST" });
      // Server signed us out + cleared 2FA — hard-reload to /login
      window.location.href = "/login";
    } catch {
      setRevokeBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Audit chain integrity */}
      <AuditIntegrity />

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History size={14} className="text-accent" />
            <CardTitle>Recent activity</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={11} /></Button>
        </CardHeader>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {(["all", "fails", "intrusion", "logins"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-600 uppercase tracking-wide transition-all border ${
                filter === f
                  ? "bg-accent-dim border-[rgba(29,155,240,0.3)] text-accent"
                  : "border-border-dim text-text-3 hover:border-border hover:text-text-2"
              }`}
            >{f}</button>
          ))}
        </div>

        {!events ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={32} />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[12px] text-text-3 text-center py-4">No events.</p>
        ) : (
          <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
            {filtered.map(ev => {
              const style = ACTION_STYLE[ev.action] ?? { color: "#94a3b8", label: ev.action };
              const isIntrusion = ev.action === "unauthorized_login_attempt";
              const summary =
                ev.metadata?.ip ? `${ev.metadata.ip}${ev.metadata.geo?.city ? ` · ${ev.metadata.geo.city}` : ""}` :
                ev.metadata?.attemptedEmail ? `attempted: ${ev.metadata.attemptedEmail}` :
                ev.metadata?.merchant ? ev.metadata.merchant :
                "";
              return (
                <div key={ev.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-[rgba(255,255,255,0.03)]">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: style.color }} />
                  <span className="text-[11px] font-600 flex-shrink-0" style={{ color: isIntrusion ? "#ef4444" : "#FAFAFA" }}>{style.label}</span>
                  <span className="text-[10px] text-text-3 truncate flex-1">{summary}</span>
                  <span className="text-[10px] text-text-3 tabular-nums flex-shrink-0">{relTime(ev.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Key rotation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-accent" />
            <CardTitle>Encryption Key Rotation</CardTitle>
          </div>
        </CardHeader>
        <p className="text-[12px] text-text-2 leading-relaxed mb-3">
          Re-encrypts every Plaid + TOTP secret with the current active key version. Use after rotating
          <code className="text-accent mx-1">ENCRYPTION_KEY</code> in Vercel. Old key must remain set until this completes
          (it's needed to decrypt existing rows).
        </p>
        <Button variant="outline" size="sm" onClick={rotateKeys} loading={rotateBusy}>
          <RefreshCw size={12} /> Re-encrypt all rows
        </Button>
      </Card>

      {/* Break-glass */}
      <Card variant="danger">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-danger" />
            <CardTitle>Break-Glass · Revoke Everything</CardTitle>
          </div>
        </CardHeader>
        <p className="text-[12px] text-text-2 leading-relaxed mb-3">
          If you suspect a compromise: signs out, clears 2FA cookie, deletes all push subscriptions and
          Plaid→Notion mappings, emails you a confirmation. You'll need to log in again, re-verify 2FA, and
          re-enable push from each device. Notion + Plaid + Supabase secret rotations are manual after.
        </p>
        <Button variant="danger" size="sm" onClick={() => setConfirmRevoke(true)}>
          <AlertTriangle size={12} /> Trigger revoke
        </Button>
      </Card>

      {confirmRevoke && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 bg-black/70 backdrop-blur-md"
             onClick={(e) => { if (e.target === e.currentTarget) setConfirmRevoke(false); }}>
          <div className="glass-3 w-full max-w-[400px] rounded-[20px] p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Shield size={18} className="text-danger" />
              <p className="text-[15px] font-700 text-text-1">Revoke everything?</p>
            </div>
            <p className="text-[12px] text-text-2">This signs you out, wipes 2FA + push + Plaid mappings, and sends you an email. There's no undo.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmRevoke(false)}>Cancel</Button>
              <Button variant="danger" size="sm" className="flex-1" loading={revokeBusy} onClick={breakGlass}>
                <X size={12} /> Revoke
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
