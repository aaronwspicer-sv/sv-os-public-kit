// Called from the client every ~2 min while signed in. Updates last_seen,
// upserts the session row, returns whether THIS session has been revoked
// (in which case the client signs out). First-seen device fires a push +
// email alert.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { ensureDeviceId } from "@/lib/deviceId";
import { labelFromUA } from "@/lib/webauthn";
import { sendPushToUser } from "@/lib/push";
import { Resend } from "resend";
import { config } from "@/config";

const ALERT_EMAIL = config.owner.alertEmail;

async function geoLookup(ip: string): Promise<{ city?: string; region?: string; country?: string }> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1")) return {};
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return {};
    const d = await r.json();
    if (d.status !== "success") return {};
    return { city: d.city, region: d.regionName, country: d.country };
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const deviceId = await ensureDeviceId();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "";
  const label = labelFromUA(ua);

  // Is there already a row for this (user, device)?
  const { data: existing } = await supabase
    .from("user_sessions")
    .select("id, revoked_at, created_at")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .maybeSingle();

  // Revoked? Tell client to sign out.
  if (existing?.revoked_at) {
    return NextResponse.json({ revoked: true });
  }

  const now = new Date().toISOString();

  if (existing) {
    // Just bump last_seen + opportunistically refresh IP if it changed
    await supabase.from("user_sessions")
      .update({ last_seen_at: now, ip })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, deviceId });
  }

  // New device — geo lookup + insert + alert
  const geo = await geoLookup(ip);
  await supabase.from("user_sessions").insert({
    user_id:      user.id,
    device_id:    deviceId,
    device_label: label,
    user_agent:   ua.slice(0, 500),
    ip,
    city:         geo.city ?? null,
    region:       geo.region ?? null,
    country:      geo.country ?? null,
    last_seen_at: now,
  });

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "new_device_session",
    metadata: { label, ip, geo },
  }).then(() => {}, () => {});

  // Push + email
  const locStr = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || ip;
  sendPushToUser(user.id, {
    title: "🔔 New device signed in",
    body:  `${label} · ${locStr}`,
    url:   "/d/settings",
    tag:   "new-device",
    requireInteraction: true,
  }).catch(() => {});

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const ts = new Date().toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "full", timeStyle: "long" });
    resend.emails.send({
      from: config.brand.emailFrom,
      to:   ALERT_EMAIL,
      subject: `🔔 New device on Spicer OS · ${label}`,
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:24px;border-radius:8px;max-width:600px;">
        <h2 style="color:#a78bfa;margin:0 0 16px;">🔔 New device signed in</h2>
        <p>Device: ${label}</p>
        <p>Location: ${locStr}</p>
        <p>IP: ${ip}</p>
        <p>Time: ${ts}</p>
        <p style="margin-top:16px;color:#666;font-size:11px;">
          If this wasn't you, open Settings → Audit Log &amp; Defense → Sign out everywhere immediately.
        </p>
      </div>`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, deviceId, isNew: true });
}
