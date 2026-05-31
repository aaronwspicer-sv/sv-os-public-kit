// Step 1 of passkey assertion (login OR 2FA bypass).
// This runs inside the 2FA gate context — user is signed-in to Supabase but
// hasn't cleared 2FA yet. So requireOwner still applies.
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { requireOwner } from "@/lib/auth";
import { resolveRpID } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const rpID = resolveRpID(req.headers.get("origin"));

  const { data: keys } = await supabase
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  if (!keys || keys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered" }, { status: 404 });
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: keys.map(k => ({
      id: k.credential_id,
      transports: (k.transports ?? undefined) as any,
    })),
    userVerification: "preferred",
  });

  await supabase.from("webauthn_challenges").insert({
    user_id: user.id,
    challenge: options.challenge,
    purpose: "auth",
  });

  return NextResponse.json(options);
}
