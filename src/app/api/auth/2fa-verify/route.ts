import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { markTwoFaCleared } from "@/lib/twofa";
import { decryptToken } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rateLimit";
import { config } from "@/config";
import * as OTPAuth from "otpauth";

// POST /api/auth/2fa-verify { token: "123456" }
// Verifies the user's TOTP code. On success, sets the signed 2FA cookie
// (good for 12h) so middleware lets them through to the dashboard.
export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  // Rate limit: max 10 attempts per user per 15 minutes (Redis layer, in
  // addition to the per-user audit_log check below)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`2fa:${user.id}:${ip}`, { limit: 10, window: 900 });
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Wait 15 minutes." }, { status: 429 });
  }

  const { token } = await req.json();
  if (!/^\d{6}$/.test(String(token ?? ""))) {
    return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
  }

  const { data: record } = await supabase
    .from("user_totp")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!record || !record.enabled) {
    return NextResponse.json({ error: "2FA not enabled" }, { status: 400 });
  }

  // Per-user rate limit on 2FA verify attempts
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: recentFails } = await supabase
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("action", "2fa_fail")
    .gte("created_at", cutoff);

  if ((recentFails ?? 0) >= 10) {
    return NextResponse.json({ error: "Too many attempts. Wait 15 minutes." }, { status: 429 });
  }

  const secretBase32 = decryptToken(record.secret_enc);
  const totp = new OTPAuth.TOTP({
    issuer: config.brand.shortName,
    label: user.email ?? "user",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: String(token), window: 1 });
  if (delta === null) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "2fa_fail" });
    return NextResponse.json({ error: "Invalid code" }, { status: 401 });
  }

  await markTwoFaCleared(user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "2fa_pass" });

  return NextResponse.json({ ok: true });
}
