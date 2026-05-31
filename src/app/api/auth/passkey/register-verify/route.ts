// Step 2 of passkey registration: verify the attestation, persist the credential.
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { requireOwner } from "@/lib/auth";
import { EXPECTED_ORIGINS, resolveRpID, labelFromUA } from "@/lib/webauthn";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const rl = await checkRateLimit(`passkey-register:${user.id}`, { limit: 10, window: 300 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body?.response) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Look up the most-recent register challenge for this user
  const { data: challengeRow } = await supabase
    .from("webauthn_challenges")
    .select("id, challenge, created_at")
    .eq("user_id", user.id)
    .eq("purpose", "register")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!challengeRow) return NextResponse.json({ error: "No active challenge" }, { status: 400 });

  // Expire challenges older than 5 minutes
  const ageMs = Date.now() - new Date(challengeRow.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const rpID = resolveRpID(req.headers.get("origin"));

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: EXPECTED_ORIGINS,
      expectedRPID: rpID,
      requireUserVerification: false, // some Chromebook flows skip UV; we still got user presence
    });
  } catch (err: any) {
    console.error("passkey verify failed:", err?.message);
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Not verified" }, { status: 400 });
  }

  const { credential, credentialBackedUp } = verification.registrationInfo;
  const label = (typeof body.label === "string" && body.label.trim().slice(0, 40))
    || labelFromUA(req.headers.get("user-agent"));

  const { error } = await supabase.from("user_passkeys").insert({
    user_id:       user.id,
    credential_id: credential.id,
    public_key:    Buffer.from(credential.publicKey).toString("base64"),
    counter:       credential.counter,
    transports:    credential.transports ?? null,
    device_label:  label,
    backed_up:     !!credentialBackedUp,
  });
  if (error) {
    console.error("passkey insert failed:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Burn the challenge
  await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);

  // Audit
  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "passkey_registered",
    metadata: { label, backed_up: !!credentialBackedUp },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, label });
}
