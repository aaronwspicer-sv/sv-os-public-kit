import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { clearTwoFa } from "@/lib/twofa";
import { Resend } from "resend";
import { config } from "@/config";

// POST /api/security/revoke-all
// Break-glass action: nuke everything if you suspect a compromise.
//   - Sign out current session
//   - Delete every push_subscription row → other devices stop receiving alerts
//   - Delete every plaid_notion_account_map row
//   - Clear the 2FA cookie so a new auth + new TOTP code is required
//   - Email the owner that this fired (so if YOU didn't trigger it you know)
//
// To go further (rotate Supabase JWT secret + Notion key + Plaid token)
// that's a manual Supabase / Notion / Plaid dashboard rotation.
export async function POST() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  // Wipe push subscriptions (other devices won't get alerts; user must
  // re-enable from each device after re-auth)
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id);

  // Wipe Plaid mappings (force re-link)
  await supabase.from("plaid_notion_account_map").delete().eq("user_id", user.id);

  // Audit
  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "break_glass_revoke",
    metadata: { triggered_at: new Date().toISOString() },
  });

  // Clear 2FA cookie + sign out of Supabase
  await clearTwoFa();
  await supabase.auth.signOut();

  // Notify
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: config.brand.emailFrom,
        to:   user.email ?? config.owner.alertEmail,
        subject: "🚨 Break-glass revoke triggered on Spicer OS",
        html: `
          <div style="font-family: monospace; background:#0a0a0a; color:#e0e0e0; padding:24px; border-radius:8px; max-width:600px;">
            <h2 style="color:#ef4444; margin:0 0 16px;">🚨 ALL SESSIONS REVOKED</h2>
            <p style="margin:8px 0;">A break-glass revoke was triggered.</p>
            <p style="margin:8px 0;">Time: ${new Date().toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "full", timeStyle: "long" })}</p>
            <p style="margin:8px 0;">What happened:</p>
            <ul style="margin:8px 0;">
              <li>Your active session was signed out</li>
              <li>2FA cookie cleared (re-verify required on next login)</li>
              <li>All push subscriptions deleted (re-enable per device)</li>
              <li>Plaid → Notion account mappings cleared</li>
            </ul>
            <p style="margin:16px 0 0; color:#ef4444;">
              If YOU triggered this: log back in and re-set up notifications + Plaid mappings.<br/>
              If NOT: change your Google password immediately, rotate
              ENCRYPTION_KEY + NOTION_API_KEY + PLAID_SECRET in Vercel,
              and review the audit log.
            </p>
          </div>
        `,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true });
}
