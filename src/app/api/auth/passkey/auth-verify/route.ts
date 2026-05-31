// Step 2 of passkey assertion. On success, sets the same 2FA cookie that the
// TOTP path sets — middleware lets the user past the 2FA gate.
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { requireOwner } from "@/lib/auth";
import { EXPECTED_ORIGINS, resolveRpID } from "@/lib/webauthn";
import { markTwoFaCleared } from "@/lib/twofa";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`passkey-auth:${user.id}:${ip}`, { limit: 10, window: 900 });
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body?.response?.id) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { data: challengeRow } = await supabase
    .from("webauthn_challenges")
    .select("id, challenge, created_at")
    .eq("user_id", user.id)
    .eq("purpose", "auth")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!challengeRow) return NextResponse.json({ error: "No active challenge" }, { status: 400 });

  const ageMs = Date.now() - new Date(challengeRow.created_at).getTime();
  if (ageMs > 5 * 60 * 1000) {
    await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  // Find the matching credential row
  const { data: cred } = await supabase
    .from("user_passkeys")
    .select("id, credential_id, public_key, counter, transports")
    .eq("user_id", user.id)
    .eq("credential_id", body.response.id)
    .maybeSingle();
  if (!cred) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "passkey_unknown" }).then(() => {}, () => {});
    return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
  }

  const rpID = resolveRpID(req.headers.get("origin"));

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
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
    console.error("passkey auth verify failed:", err?.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "passkey_fail" }).then(() => {}, () => {});
    return NextResponse.json({ error: "Verification failed" }, { status: 401 });
  }

  if (!verification.verified) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "passkey_fail" }).then(() => {}, () => {});
    return NextResponse.json({ error: "Not verified" }, { status: 401 });
  }

  // Bump counter + last-used. Counter going BACKWARDS = cloned credential → reject.
  const newCounter = verification.authenticationInfo.newCounter;
  if (newCounter > 0 && Number(cred.counter ?? 0) > newCounter) {
    await supabase.from("audit_log").insert({ user_id: user.id, action: "passkey_counter_regression", metadata: { credId: cred.credential_id } }).then(() => {}, () => {});
    return NextResponse.json({ error: "Credential possibly cloned — revoke required" }, { status: 401 });
  }

  await supabase.from("user_passkeys")
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq("id", cred.id);
  await supabase.from("webauthn_challenges").delete().eq("id", challengeRow.id);

  await markTwoFaCleared(user.id);
  await supabase.from("audit_log").insert({ user_id: user.id, action: "passkey_pass" }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
