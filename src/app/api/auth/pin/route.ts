import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { checkRateLimit } from "@/lib/rateLimit";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { config } from "@/config";

// Tighter PIN policy:
//   - 5 wrong attempts inside the 5-attempt window → escalating lockout
//   - Lockout schedule (minutes): 1 → 5 → 15 → 30 → 60 → 360 → 1440
//     (final 24h tier; you'd have to be patient AND lucky)
//   - Every failed attempt fires a push + email so you always know
//   - Successful unlock also fires a push (audit trail for ALL access)
//   - bcrypt cost 12 + constant-time compare
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = [1, 5, 15, 30, 60, 360, 1440]; // 1m → 24h
const ALERT_EMAIL = config.owner.alertEmail;

function getClientIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function summarizeUA(ua: string): string {
  const browser =
    ua.includes("Edg/") ? "Edge" : ua.includes("Chrome") ? "Chrome" :
    ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Unknown";
  const os =
    ua.includes("Windows") ? "Windows" :
    ua.includes("Mac OS X") ? "macOS" :
    ua.includes("iPhone") ? "iPhone" :
    ua.includes("iPad") ? "iPad" :
    ua.includes("Android") ? "Android" : "Unknown OS";
  return `${browser} / ${os}`;
}

async function alertPinFail(opts: { ip: string; ua: string; attemptsLeft: number; locked: boolean; lockMin?: number }) {
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  const ts = new Date().toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "full", timeStyle: "long" });
  const subject = opts.locked
    ? `🚨 PIN locked — ${opts.lockMin}m lockout (${opts.ip})`
    : `⚠️ Failed PIN attempt — ${opts.attemptsLeft} left (${opts.ip})`;

  if (resend) {
    await resend.emails.send({
      from: config.brand.emailFrom,
      to:   ALERT_EMAIL,
      subject,
      html: `
        <div style="font-family: monospace; background:#0a0a0a; color:#e0e0e0; padding:24px; border-radius:8px; max-width:600px;">
          <h2 style="color:${opts.locked ? "#ef4444" : "#fbbf24"}; margin:0 0 16px;">${opts.locked ? "PIN LOCKED" : "FAILED PIN"}</h2>
          <p style="margin:4px 0;">Time: ${ts}</p>
          <p style="margin:4px 0;">IP: ${opts.ip}</p>
          <p style="margin:4px 0;">Device: ${summarizeUA(opts.ua)}</p>
          ${opts.locked
            ? `<p style="margin:12px 0 0; color:#ef4444;">Account locked for ${opts.lockMin} minute(s). If this wasn't you, sign out everywhere from Settings.</p>`
            : `<p style="margin:12px 0 0;">Attempts left: <strong style="color:#fbbf24;">${opts.attemptsLeft}</strong></p>`}
        </div>
      `,
    }).catch(() => {});
  }
}

// GET — is a PIN set for the current user? Used by Settings overview.
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data } = await supabase
    .from("user_pins")
    .select("user_id, locked_until")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    exists:    !!data,
    lockedUntil: data?.locked_until ?? null,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const ip = getClientIP(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Rate limit: max 20 PIN-route requests per user+IP per 5 minutes
  const rl = await checkRateLimit(`pin:${user.id}:${ip}`, { limit: 20, window: 300 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { action, pin, currentPin } = await req.json();

  if (action === "setup") {
    if (!pin || pin.length < 4) {
      return NextResponse.json({ error: "PIN must be at least 4 digits" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("user_pins")
      .select("pin_hash, attempts, locked_until")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      if (existing.locked_until && new Date(existing.locked_until) > new Date()) {
        const remaining = Math.ceil((new Date(existing.locked_until).getTime() - Date.now()) / 60000);
        return NextResponse.json({ error: `Account locked. Try again in ${remaining} minute(s).`, locked: true }, { status: 429 });
      }
      if (!currentPin) {
        return NextResponse.json({ error: "Current PIN required to change PIN", requiresCurrent: true }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPin, existing.pin_hash);
      if (!valid) {
        const newAttempts = (existing.attempts ?? 0) + 1;
        let locked_until = null;
        let lockMin = 0;
        if (newAttempts > 0 && newAttempts % MAX_ATTEMPTS === 0) {
          const tier = Math.min(Math.floor(newAttempts / MAX_ATTEMPTS) - 1, LOCKOUT_MINUTES.length - 1);
          lockMin = LOCKOUT_MINUTES[tier];
          locked_until = new Date(Date.now() + lockMin * 60 * 1000).toISOString();
        }
        await supabase.from("user_pins").update({ attempts: newAttempts, locked_until }).eq("user_id", user.id);
        await supabase.from("audit_log").insert({
          user_id: user.id, action: "pin_change_fail",
          metadata: { attempts: newAttempts, ip, ua: summarizeUA(ua), locked: !!locked_until },
        });
        const attemptsLeft = MAX_ATTEMPTS - (newAttempts % MAX_ATTEMPTS);
        alertPinFail({ ip, ua, attemptsLeft, locked: !!locked_until, lockMin }).catch(() => {});
        sendPushToUser(user.id, {
          title: locked_until ? `🚨 PIN locked · ${lockMin}m` : `⚠️ Failed PIN attempt`,
          body:  locked_until ? `Locked from ${summarizeUA(ua)} · ${ip}` : `${attemptsLeft} attempts left · ${summarizeUA(ua)}`,
          url:   "/d/settings",
          tag:   "pin-fail",
          requireInteraction: !!locked_until,
        }).catch(() => {});
        return NextResponse.json({
          error: locked_until ? `Too many attempts. Locked for ${lockMin} minute(s).` : `Incorrect current PIN — ${attemptsLeft} attempt(s) left`,
          attemptsLeft,
          locked: !!locked_until,
        }, { status: locked_until ? 429 : 401 });
      }
    }

    const pin_hash = await bcrypt.hash(pin, 12);
    await supabase.from("user_pins").upsert({ user_id: user.id, pin_hash, attempts: 0, locked_until: null }, { onConflict: "user_id" });
    await supabase.from("audit_log").insert({
      user_id: user.id, action: existing ? "pin_changed" : "pin_created",
      metadata: { ip, ua: summarizeUA(ua) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "verify") {
    const { data: record } = await supabase
      .from("user_pins")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!record) return NextResponse.json({ error: "PIN not set up" }, { status: 400 });

    if (record.locked_until && new Date(record.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(record.locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json({ error: `Account locked. Try again in ${remaining} minute(s).`, locked: true }, { status: 429 });
    }

    const valid = await bcrypt.compare(pin, record.pin_hash);

    if (!valid) {
      const newAttempts = (record.attempts ?? 0) + 1;
      let locked_until = null;
      let lockMin = 0;
      if (newAttempts > 0 && newAttempts % MAX_ATTEMPTS === 0) {
        const tier = Math.min(Math.floor(newAttempts / MAX_ATTEMPTS) - 1, LOCKOUT_MINUTES.length - 1);
        lockMin = LOCKOUT_MINUTES[tier];
        locked_until = new Date(Date.now() + lockMin * 60 * 1000).toISOString();
      }
      await supabase.from("user_pins").update({ attempts: newAttempts, locked_until }).eq("user_id", user.id);
      await supabase.from("audit_log").insert({
        user_id: user.id, action: "pin_fail",
        metadata: { attempts: newAttempts, ip, ua: summarizeUA(ua), locked: !!locked_until },
      });
      const attemptsLeft = MAX_ATTEMPTS - (newAttempts % MAX_ATTEMPTS);
      alertPinFail({ ip, ua, attemptsLeft, locked: !!locked_until, lockMin }).catch(() => {});
      sendPushToUser(user.id, {
        title: locked_until ? `🚨 PIN locked · ${lockMin}m` : `⚠️ Failed PIN attempt`,
        body:  locked_until ? `Locked from ${summarizeUA(ua)} · ${ip}` : `${attemptsLeft} attempts left · ${summarizeUA(ua)}`,
        url:   "/d/settings",
        tag:   "pin-fail",
        requireInteraction: !!locked_until,
      }).catch(() => {});
      return NextResponse.json({ error: "Incorrect PIN", attemptsLeft, locked: !!locked_until }, { status: locked_until ? 429 : 401 });
    }

    await supabase.from("user_pins").update({ attempts: 0, locked_until: null }).eq("user_id", user.id);
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "pin_success",
      metadata: { ip, ua: summarizeUA(ua) },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
