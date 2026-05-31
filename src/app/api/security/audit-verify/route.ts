// Walks the user's audit log chain. Reports first break (or all-clear).
// On break: fires push + email alert (someone may have tampered with the DB).
import { NextResponse } from "next/server";
import { config } from "@/config";
import { requireOwner } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { Resend } from "resend";

const ALERT_EMAIL = config.owner.alertEmail;

export async function POST() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase.rpc("audit_log_verify_chain", { p_user_id: user.id });
  if (error) {
    console.error("audit-verify rpc failed:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const checked: number = Number(row?.checked ?? 0);
  const brokenAtSeq: number | null = row?.broken_at_seq ?? null;
  const brokenAtId:  string | null = row?.broken_at_id  ?? null;
  const reason:      string | null = row?.reason ?? null;

  const ok = brokenAtSeq === null && reason === null;

  // Record the verification itself (this insert goes through the trigger,
  // which extends the chain — that's fine and expected)
  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: ok ? "audit_chain_verify_ok" : "audit_chain_verify_BROKEN",
    metadata: { checked, brokenAtSeq, brokenAtId, reason },
  }).then(() => {}, () => {});

  if (!ok) {
    // CRITICAL: someone may have tampered with the audit log
    sendPushToUser(user.id, {
      title: "🚨 AUDIT LOG INTEGRITY BROKEN",
      body:  `${reason} at seq ${brokenAtSeq}. Open Settings now.`,
      url:   "/d/settings",
      tag:   "audit-broken",
      requireInteraction: true,
    }).catch(() => {});

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: config.brand.emailFrom,
        to:   ALERT_EMAIL,
        subject: `🚨 AUDIT LOG INTEGRITY BROKEN — ${config.brand.shortName}`,
        html: `<div style="font-family:monospace;background:#0a0a0a;color:#ef4444;padding:24px;border-radius:8px;max-width:600px;">
          <h2 style="color:#ef4444;margin:0 0 16px;">🚨 Audit Log Tampered</h2>
          <p><strong>Reason:</strong> ${reason}</p>
          <p><strong>Broken at seq:</strong> ${brokenAtSeq}</p>
          <p><strong>Row id:</strong> ${brokenAtId}</p>
          <p><strong>Rows checked before break:</strong> ${checked}</p>
          <p style="margin-top:16px;color:#fbbf24;">
            Someone with DB access edited or deleted an audit_log row, OR the chain secret in Supabase Vault has been rotated/lost.
            Open Settings → Audit immediately.
          </p>
        </div>`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok,
    checked,
    brokenAtSeq,
    brokenAtId,
    reason,
    verifiedAt: new Date().toISOString(),
  });
}
