import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { unlockVault, FINANCE_VAULT_TTL_SEC } from "@/lib/financeVault";
import { decryptToken } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendPushToUser } from "@/lib/push";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { EXPECTED_ORIGINS, resolveRpID } from "@/lib/webauthn";
import { Resend } from "resend";
import * as OTPAuth from "otpauth";
import bcrypt from "bcryptjs";
import { config } from "@/config";

// POST /api/finance/unlock { pin, totp, passkey: <assertion> }
// Requires ALL THREE: PIN + TOTP + Passkey biometric. On success sets the
// 5-minute finance vault cookie. Aggressive alerting on every attempt.

const ALERT_EMAIL = config.owner.alertEmail;

function getIP(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function summarizeUA(ua: string): string {
  const browser = ua.includes("Edg/") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Unknown";
  const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac OS X") ? "macOS" : ua.includes("iPhone") ? "iPhone" : ua.includes("iPad") ? "iPad" : ua.includes("Android") ? "Android" : "Unknown OS";
  return `${browser} / ${os}`;
}

async function alertVaultEvent(opts: { ip: string; ua: string; success: boolean; reason?: string }) {
  if (!process.env.RESEND_API_KEY) return;
  const resend = new Resend(process.env.RESEND_API_KEY);
  const ts = new Date().toLocaleString("en-CA", { timeZone: config.locale.timezone, dateStyle: "full", timeStyle: "long" });
  await resend.emails.send({
    from: config.brand.emailFrom,
    to:   ALERT_EMAIL,
    subject: opts.success ? `💰 Finance vault unlocked (${opts.ip})` : `🚨 Finance vault unlock FAILED · ${opts.reason} (${opts.ip})`,
    html: `
      <div style="font-family:monospace; background:#0a0a0a; color:#e0e0e0; padding:24px; border-radius:8px; max-width:600px;">
        <h2 style="color:${opts.success ? "#34d399" : "#ef4444"}; margin:0 0 16px;">
          ${opts.success ? "💰 Finance Vault Unlocked" : "🚨 Finance Vault Unlock Failed"}
        </h2>
        <p style="margin:4px 0;">Time: ${ts}</p>
        <p style="margin:4px 0;">IP: ${opts.ip}</p>
        <p style="margin:4px 0;">Device: ${summarizeUA(opts.ua)}</p>
        ${opts.reason ? `<p style="margin:4px 0; color:#ef4444;">Reason: ${opts.reason}</p>` : ""}
        ${opts.success ? `<p style="margin:12px 0 0; color:#666; font-size:11px;">Vault auto-locks in ${FINANCE_VAULT_TTL_SEC / 60} minutes.</p>` : ""}
      </div>
    `,
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const ip = getIP(req);
  const ua = req.headers.get("user-agent") ?? "";

  // Rate limit aggressively — vault unlock is high-value
  const rl = await checkRateLimit(`vault:${user.id}:${ip}`, { limit: 5, window: 300 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Wait 5 minutes.", code: "rate_limit" }, { status: 429 });

  const { pin, totp, passkey } = await req.json();
  if (!pin || !totp || !passkey?.id) {
    return NextResponse.json({ error: "PIN, TOTP and passkey all required" }, { status: 400 });
  }

  // ── Step 1: verify PIN ──
  const { data: pinRec } = await supabase
    .from("user_pins")
    .select("pin_hash, attempts, locked_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pinRec) {
    return NextResponse.json({ error: "PIN not set up. Configure in Settings first.", code: "no_pin" }, { status: 400 });
  }
  if (pinRec.locked_until && new Date(pinRec.locked_until) > new Date()) {
    return NextResponse.json({ error: "PIN is locked. Wait the lockout period.", code: "pin_locked" }, { status: 423 });
  }

  const pinValid = await bcrypt.compare(String(pin), pinRec.pin_hash);
  if (!pinValid) {
    // Record the fail in the PIN counter (uses pin endpoint's existing mechanism by writing audit)
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "vault_pin_fail",
      metadata: { ip, ua: summarizeUA(ua) },
    });
    alertVaultEvent({ ip, ua, success: false, reason: "wrong PIN" }).catch(() => {});
    sendPushToUser(user.id, {
      title: "🚨 Finance vault PIN failed",
      body: `From ${summarizeUA(ua)} · ${ip}`,
      url: "/d/settings",
      tag: "vault-fail",
      requireInteraction: true,
    }).catch(() => {});
    return NextResponse.json({ error: "Wrong PIN", code: "wrong_pin" }, { status: 401 });
  }

  // ── Step 2: verify TOTP ──
  const { data: totpRec } = await supabase
    .from("user_totp")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!totpRec?.enabled) {
    return NextResponse.json({ error: "2FA must be enabled to unlock finance vault. Enable in Settings.", code: "no_totp" }, { status: 400 });
  }

  const totpSecret = decryptToken(totpRec.secret_enc);
  const otp = new OTPAuth.TOTP({
    issuer: config.brand.shortName, label: user.email ?? "user",
    algorithm: "SHA1", digits: 6, period: 30,
    secret: OTPAuth.Secret.fromBase32(totpSecret),
  });

  if (!/^\d{6}$/.test(String(totp))) {
    return NextResponse.json({ error: "Invalid TOTP format", code: "bad_totp" }, { status: 400 });
  }

  const delta = otp.validate({ token: String(totp), window: 1 });
  if (delta === null) {
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "vault_totp_fail",
      metadata: { ip, ua: summarizeUA(ua) },
    });
    alertVaultEvent({ ip, ua, success: false, reason: "wrong TOTP code" }).catch(() => {});
    sendPushToUser(user.id, {
      title: "🚨 Finance vault TOTP failed",
      body: `From ${summarizeUA(ua)} · ${ip}`,
      url: "/d/settings",
      tag: "vault-fail",
      requireInteraction: true,
    }).catch(() => {});
    return NextResponse.json({ error: "Wrong TOTP code", code: "wrong_totp" }, { status: 401 });
  }

  // ── Step 3: verify Passkey (biometric) ──
  const { data: challengeRow } = await supabase
    .from("webauthn_challenges")
    .select("id, challenge, created_at")
    .eq("user_id", user.id)
    .eq("purpose", "vault")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!challengeRow) {
    return NextResponse.json({ error: "No active passkey challenge — restart unlock", code: "no_challenge" }, { status: 400 });
  }
  const ageMs = Date.now() - new Date(challengeRow.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);
    return NextResponse.json({ error: "Passkey challenge expired", code: "challenge_expired" }, { status: 400 });
  }

  const { data: cred } = await supabase
    .from("user_passkeys")
    .select("id, credential_id, public_key, counter, transports")
    .eq("user_id", user.id)
    .eq("credential_id", passkey.id)
    .maybeSingle();
  if (!cred) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "vault_passkey_unknown", metadata: { ip, ua: summarizeUA(ua) } });
    alertVaultEvent({ ip, ua, success: false, reason: "unknown passkey" }).catch(() => {});
    return NextResponse.json({ error: "Unknown passkey", code: "unknown_passkey" }, { status: 401 });
  }

  const rpID = resolveRpID(req.headers.get("origin"));
  let pkVerification;
  try {
    pkVerification = await verifyAuthenticationResponse({
      response: passkey,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: new Uint8Array(Buffer.from(cred.public_key, "base64")),
        counter: Number(cred.counter ?? 0),
        transports: (cred.transports ?? undefined) as any,
      },
      requireUserVerification: false,
    });
  } catch (err: any) {
    console.error("vault passkey verify failed:", err?.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "vault_passkey_fail", metadata: { ip, ua: summarizeUA(ua) } });
    alertVaultEvent({ ip, ua, success: false, reason: "passkey rejected" }).catch(() => {});
    sendPushToUser(user.id, {
      title: "🚨 Finance vault passkey failed",
      body: `From ${summarizeUA(ua)} · ${ip}`,
      url: "/d/settings", tag: "vault-fail", requireInteraction: true,
    }).catch(() => {});
    return NextResponse.json({ error: "Passkey verification failed", code: "wrong_passkey" }, { status: 401 });
  }
  if (!pkVerification.verified) {
    return NextResponse.json({ error: "Passkey rejected", code: "wrong_passkey" }, { status: 401 });
  }

  // Counter regression = cloned credential → refuse + flag
  const newCounter = pkVerification.authenticationInfo.newCounter;
  if (newCounter > 0 && Number(cred.counter ?? 0) > newCounter) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "vault_passkey_counter_regression", metadata: { credId: cred.credential_id, ip } });
    alertVaultEvent({ ip, ua, success: false, reason: "passkey counter regression — possible clone" }).catch(() => {});
    return NextResponse.json({ error: "Credential possibly cloned — revoke required", code: "clone_suspected" }, { status: 401 });
  }
  await supabase.from("user_passkeys").update({ counter: newCounter, last_used_at: new Date().toISOString() }).eq("id", cred.id);
  await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);

  // ── All three factors passed → open the vault ──
  await unlockVault(user.id);

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "vault_unlocked",
    metadata: { ip, ua: summarizeUA(ua) },
  });
  alertVaultEvent({ ip, ua, success: true }).catch(() => {});
  sendPushToUser(user.id, {
    title: "💰 Finance vault unlocked",
    body: `${summarizeUA(ua)} · auto-locks in 5min`,
    url: "/d/finances",
    tag: "vault-unlock",
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    expiresAt: Date.now() + FINANCE_VAULT_TTL_SEC * 1000,
  });
}
