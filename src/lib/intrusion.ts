// Intrusion alerting — invoked from middleware when an authenticated
// but DISallowed email tries to access the app.
//
// PREVIOUSLY: this tried to send a Resend email from inside middleware,
// fire-and-forget. Vercel Edge Runtime terminates the function as soon as
// the response is returned, and Next.js middleware doesn't expose a public
// waitUntil API, so the email frequently didn't actually fire. The
// audit_log INSERT was reliable, but the email was not.
//
// NOW: middleware writes an audit_log row with action="unauthorized_login_attempt"
// and a metadata.notified=false flag. The morning-brief cron drains any
// un-notified intrusion rows from the last 24h into a single digest email
// at the top of its run. Latency: ≤24h. That's fine for an event Aaron has
// never actually triggered, and it's reliable instead of best-effort.
//
// All HTML inputs are escaped to avoid injection from spoofed UA strings.
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/config";

const OWNER_EMAIL = config.owner.alertEmail;

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseUA(ua: string) {
  const browser =
    ua.includes("Edg/")     ? "Edge" :
    ua.includes("Chrome/")  ? "Chrome" :
    ua.includes("Firefox/") ? "Firefox" :
    ua.includes("Safari/") && !ua.includes("Chrome") ? "Safari" :
    ua.includes("OPR/")     ? "Opera" :
    "Unknown Browser";
  const os =
    ua.includes("Windows NT 10") ? "Windows 10/11" :
    ua.includes("Windows NT")    ? "Windows" :
    ua.includes("Mac OS X")      ? "macOS" :
    ua.includes("iPhone")        ? "iOS (iPhone)" :
    ua.includes("iPad")          ? "iPadOS" :
    ua.includes("Android")       ? "Android" :
    ua.includes("Linux")         ? "Linux" :
    "Unknown OS";
  const type =
    ua.includes("Mobile") || ua.includes("iPhone") || ua.includes("Android") ? "Mobile" :
    ua.includes("iPad")   ? "Tablet" :
    "Desktop";
  return { browser, os, type };
}

export interface IntrusionEvent {
  attemptedEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  path?: string | null;
}

/**
 * Records an intrusion attempt to audit_log. The morning-brief cron will
 * pick this up via drainIntrusionDigest() and email a digest. We do NOT
 * send the email from here because middleware (edge runtime) terminates
 * before fire-and-forget promises resolve, so the email was unreliable.
 *
 * Safe to call from middleware. Always pass the supabase client built in
 * middleware (createClient() depends on next/headers cookies which the
 * edge runtime doesn't have).
 *
 * Failure-tolerant: any errors caught + logged; never throws.
 */
export async function fireIntrusionAlert(
  ev: IntrusionEvent,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const ua = ev.userAgent ?? "";
    const device = parseUA(ua);

    // Note: we DON'T geo-lookup here — that fetch was racing the edge
    // runtime's termination. The morning brief drains the digest and can
    // do the geo lookup at email-render time where it has full lifetime.
    await supabase.from("audit_log").insert({
      action: "unauthorized_login_attempt",
      metadata: {
        attemptedEmail: ev.attemptedEmail,
        ip: ev.ip,
        path: ev.path,
        userAgent: ua,
        device,
        notified: false,
      },
    });
  } catch (e: any) {
    console.warn("audit_log insert failed:", e?.message);
  }
}

/** Used by the morning brief to render the digest table row. */
function formatIntrusionRow(row: any): string {
  const m = row.metadata ?? {};
  const when = new Date(row.created_at).toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "short", timeStyle: "short" });
  const device = m.device?.browser && m.device?.os ? `${m.device.browser} · ${m.device.os}` : "Unknown device";
  return `
    <tr>
      <td style="color:#fff; padding:6px 8px; font-family:monospace;">${escapeHtml(when)}</td>
      <td style="color:#f97316; padding:6px 8px; font-weight:bold;">${escapeHtml(m.attemptedEmail ?? "unknown")}</td>
      <td style="color:#fff; padding:6px 8px;">${escapeHtml(m.ip ?? "unknown")}</td>
      <td style="color:#aaa; padding:6px 8px; font-size:11px;">${escapeHtml(device)}</td>
      <td style="color:#aaa; padding:6px 8px; font-family:monospace; font-size:11px;">${escapeHtml(m.path ?? "/")}</td>
    </tr>`;
}

/**
 * Called once at the top of the morning-brief cron. Pulls every
 * unauthorized_login_attempt from the last 24h where metadata.notified
 * is not already true, emails a single digest via Resend, then marks
 * those rows as notified.
 *
 * Returns the number of attempts notified, or 0 (incl. if Resend unset).
 */
export async function drainIntrusionDigest(
  supabase: SupabaseClient,
  resendKey: string | undefined,
): Promise<number> {
  if (!resendKey) return 0;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("audit_log")
    .select("id, action, metadata, created_at")
    .eq("action", "unauthorized_login_attempt")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  // Filter out rows already marked notified
  const pending = (rows ?? []).filter(r => !(r.metadata as any)?.notified);
  if (pending.length === 0) return 0;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: config.brand.emailFrom,
      to: OWNER_EMAIL,
      subject: `🚨 ${pending.length} unauthorized access attempt${pending.length === 1 ? "" : "s"} in the last 24h`,
      html: `
        <div style="font-family: monospace; background: #0a0a0a; color: #e0e0e0; padding: 32px; border-radius: 8px; max-width: 720px;">
          <h2 style="color: #ef4444; margin: 0 0 8px;">🚨 Unauthorized Access Digest</h2>
          <p style="color: #aaa; font-size: 12px; margin: 0 0 18px;">${pending.length} attempt${pending.length === 1 ? "" : "s"} in the last 24h. All have been signed out and blocked.</p>
          <table style="width:100%; border-collapse:collapse; background:#1a1a1a; border-radius:6px; overflow:hidden;">
            <thead><tr style="background:#222;">
              <th style="color:#888; padding:8px; text-align:left; font-size:11px;">Time</th>
              <th style="color:#888; padding:8px; text-align:left; font-size:11px;">Email</th>
              <th style="color:#888; padding:8px; text-align:left; font-size:11px;">IP</th>
              <th style="color:#888; padding:8px; text-align:left; font-size:11px;">Device</th>
              <th style="color:#888; padding:8px; text-align:left; font-size:11px;">Path</th>
            </tr></thead>
            <tbody>${pending.map(formatIntrusionRow).join("")}</tbody>
          </table>
          <p style="color: #666; font-size: 11px; margin-top: 18px;">If any of these were YOU (e.g. a typo'd login), no action needed. If they look suspicious, the audit_log table has the full payload.</p>
        </div>`,
    });
  } catch (err: any) {
    console.error("drainIntrusionDigest send failed:", err?.message);
    return 0;
  }

  // Mark notified — merge with existing metadata so we don't clobber it.
  for (const r of pending) {
    const meta = { ...(r.metadata as any ?? {}), notified: true, notifiedAt: new Date().toISOString() };
    await supabase.from("audit_log").update({ metadata: meta }).eq("id", r.id);
  }
  return pending.length;
}
