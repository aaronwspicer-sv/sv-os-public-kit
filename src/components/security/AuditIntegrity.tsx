"use client";
// Tile that shows audit-chain integrity status. Auto-verifies on mount.
// Manual re-verify button. Lives inside the Security Panel section.
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react";

interface VerifyResult {
  ok: boolean;
  checked: number;
  brokenAtSeq: number | null;
  brokenAtId:  string | null;
  reason:      string | null;
  verifiedAt:  string;
}

export function AuditIntegrity() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/security/audit-verify", { method: "POST" });
      if (r.ok) {
        const d = await r.json();
        setResult(d);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { verify(); }, [verify]);

  if (!result) {
    return (
      <Card className="flex items-center gap-3">
        <RefreshCw size={16} className="animate-spin text-text-3" />
        <p className="text-[12px] text-text-3">Verifying audit chain…</p>
      </Card>
    );
  }

  const verifiedAgo = (() => {
    const ms = Date.now() - new Date(result.verifiedAt).getTime();
    const s = Math.max(1, Math.floor(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  })();

  return (
    <Card className={`flex flex-col gap-3 ${result.ok ? "" : "border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.04)]"}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0 ${
          result.ok
            ? "bg-[rgba(52,211,153,0.10)] border border-[rgba(52,211,153,0.22)]"
            : "bg-[rgba(239,68,68,0.10)] border border-[rgba(239,68,68,0.30)]"
        }`}>
          {result.ok
            ? <ShieldCheck size={18} className="text-success" />
            : <ShieldAlert size={18} className="text-danger animate-pulse" />}
        </div>
        <div className="flex-1">
          <p className={`text-[14px] font-600 ${result.ok ? "text-text-1" : "text-danger"}`}>
            {result.ok ? "Audit log integrity verified" : "AUDIT LOG TAMPERED"}
          </p>
          <p className="text-[11px] text-text-3 mt-0.5">
            {result.ok
              ? `${result.checked.toLocaleString()} rows · hash chain intact · checked ${verifiedAgo}`
              : `${result.reason} at seq ${result.brokenAtSeq}. Investigate immediately.`}
          </p>
          {!result.ok && result.brokenAtId && (
            <p className="text-[10px] text-text-3 font-mono mt-1">id: {result.brokenAtId}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={verify} loading={busy}>
          <RefreshCw size={12} /> Re-verify
        </Button>
      </div>

      {!result.ok && (
        <p className="text-[10px] text-text-3 leading-relaxed">
          A row in the audit log has been edited, deleted, or inserted out-of-band — OR the
          chain secret in Supabase Vault was rotated. If you didn't intentionally change either,
          treat this as a confirmed intrusion: revoke all sessions, rotate keys, audit Plaid + Notion.
        </p>
      )}
    </Card>
  );
}
