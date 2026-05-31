import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { config } from "@/config";

export async function GET() {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return gate.error;
    const { user, supabase } = gate;

    // If 2FA is already enabled, don't regenerate — return alreadyEnabled flag
    const { data: existing } = await supabase
      .from("user_totp")
      .select("enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.enabled) {
      return NextResponse.json({ alreadyEnabled: true });
    }

    // Generate a cryptographically random 20-byte secret
    const secret = new OTPAuth.Secret({ size: 20 });

    const totp = new OTPAuth.TOTP({
      issuer: config.brand.shortName,
      label: user.email ?? "user",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    // Store encrypted secret (not yet enabled — enabled only after verification)
    const secret_enc = encryptToken(secret.base32);
    const { error: upsertError } = await supabase
      .from("user_totp")
      .upsert({ user_id: user.id, secret_enc, enabled: false }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("TOTP upsert error:", upsertError);
      return NextResponse.json({ error: `DB error: ${upsertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ secret: secret.base32, qrCode });
  } catch (err: any) {
    console.error("TOTP GET error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return gate.error;
    const { user, supabase } = gate;

    const { action, token } = await req.json();

    const { data: record, error: fetchError } = await supabase
      .from("user_totp")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (fetchError || !record) {
      return NextResponse.json({ error: "TOTP not set up" }, { status: 400 });
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

    // validate returns null if invalid, or the time-step delta (-1, 0, 1) if valid
    const delta = totp.validate({ token, window: 1 });
    const valid = delta !== null;

    if (!valid) {
      await supabase.from("audit_log").insert({ user_id: user.id, action: "totp_fail" });
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    if (action === "enable") {
      await supabase.from("user_totp").update({ enabled: true }).eq("user_id", user.id);
      await supabase.from("audit_log").insert({ user_id: user.id, action: "totp_enabled" });
    }

    if (action === "verify") {
      await supabase.from("audit_log").insert({ user_id: user.id, action: "totp_verify_success" });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TOTP POST error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// Disable 2FA and wipe the secret so user can set up fresh
export async function DELETE() {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return gate.error;
    const { user, supabase } = gate;

    await supabase.from("user_totp").delete().eq("user_id", user.id);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "totp_disabled" });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("TOTP DELETE error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
