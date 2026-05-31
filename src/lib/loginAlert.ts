// Fires an email + push when a successful login happens.
// Skips if the same {user_id, IP, UA} combo successfully logged in within
// the last 24h (avoids alert fatigue on every page refresh that re-issues a session).
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";
import { config } from "@/config";

const OWNER_EMAIL = config.owner.alertEmail;

function escapeHtml(s: string | undefined | null): string {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function summarizeUA(ua: string): string {
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Unknown";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac OS X") ? "macOS" : ua.includes("iPhone") ? "iPhone" : ua.includes("iPad") ? "iPad" : ua.includes("Android") ? "Android" : "Unknown OS";
  return `${browser} / ${os}`;
}

export interface LoginEvent {
  userId: string;
  email: string;
  ip: string;
  userAgent: string;
}

export async function fireLoginAlert(ev: LoginEvent): Promise<void> {
  try {
    const supabase = await createClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Already alerted for this user+ip+ua combo recently?
    const { data: recent } = await supabase
      .from("audit_log")
      .select("id")
      .eq("user_id", ev.userId)
      .eq("action", "login_success")
      .gte("created_at", cutoff)
      .contains("metadata", { ip: ev.ip, ua: summarizeUA(ev.userAgent) })
      .limit(1);

    const alreadyAlerted = (recent?.length ?? 0) > 0;

    // Always log the success, even if we don't email/push
    await supabase.from("audit_log").insert({
      user_id: ev.userId,
      action: "login_success",
      metadata: { ip: ev.ip, ua: summarizeUA(ev.userAgent), userAgent: ev.userAgent, email: ev.email, alertSuppressed: alreadyAlerted },
    });

    if (alreadyAlerted) return;

    // Geo
    let geo: Record<string, string> = {};
    if (ev.ip && ev.ip !== "unknown") {
      try {
        const r = await fetch(`https://ip-api.com/json/${encodeURIComponent(ev.ip)}?fields=country,regionName,city,isp,org`, { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        if (d?.status !== "fail") geo = { country: d.country, region: d.regionName, city: d.city, isp: d.isp, org: d.org };
      } catch {}
    }

    const ts = new Date().toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "full", timeStyle: "long" });

    // Email
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: config.brand.emailFrom,
        to:   OWNER_EMAIL,
        subject: `✅ Login from ${geo.city ? `${geo.city}, ${geo.country}` : ev.ip}`,
        html: `
          <div style="font-family: monospace; background:#0a0a0a; color:#e0e0e0; padding:24px; border-radius:8px; max-width:600px;">
            <h2 style="color:#34d399; margin:0 0 16px;">✅ Successful Login</h2>
            <table style="width:100%; border-collapse:collapse;">
              <tr><td style="color:#888; padding:4px 0; width:120px;">Time</td><td style="color:#fff;">${escapeHtml(ts)}</td></tr>
              <tr><td style="color:#888; padding:4px 0;">Email</td><td style="color:#fff;">${escapeHtml(ev.email)}</td></tr>
              <tr><td style="color:#888; padding:4px 0;">IP</td><td style="color:#fff;">${escapeHtml(ev.ip)}</td></tr>
              ${geo.city ? `<tr><td style="color:#888; padding:4px 0;">Location</td><td style="color:#fff;">${escapeHtml(geo.city)}, ${escapeHtml(geo.region)}, ${escapeHtml(geo.country)}</td></tr>` : ""}
              ${geo.isp ? `<tr><td style="color:#888; padding:4px 0;">ISP</td><td style="color:#fff;">${escapeHtml(geo.isp)}</td></tr>` : ""}
              <tr><td style="color:#888; padding:4px 0;">Device</td><td style="color:#fff;">${escapeHtml(summarizeUA(ev.userAgent))}</td></tr>
            </table>
            <p style="margin:16px 0 0; color:#666; font-size:11px;">
              If this wasn't you, sign out everywhere from Settings and rotate your Google/email password immediately.
            </p>
          </div>
        `,
      });
    }

    // Push
    await sendPushToUser(ev.userId, {
      title: `✅ New login · ${geo.city ?? ev.ip}`,
      body:  `${summarizeUA(ev.userAgent)} · ${geo.country ?? ev.ip}`,
      url:   "/d/settings",
      tag:   "login-success",
    }).catch(() => {});
  } catch (e: any) {
    console.error("Login alert failed:", e?.message);
  }
}
