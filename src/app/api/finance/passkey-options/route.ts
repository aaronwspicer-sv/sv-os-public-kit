// Issues a passkey challenge specifically for the Finance Vault unlock.
// Separate purpose='vault' so this challenge can't be replayed against the
// regular 2FA gate.
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { requireOwner } from "@/lib/auth";
import { resolveRpID } from "@/lib/webauthn";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`vault-passkey-opts:${user.id}:${ip}`, { limit: 10, window: 300 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const rpID = resolveRpID(req.headers.get("origin"));

  const { data: keys } = await supabase
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  if (!keys || keys.length === 0) {
    return NextResponse.json(
      { error: "No passkeys registered. Add one in Settings → Passkeys before using the vault.", code: "no_passkey" },
      { status: 400 },
    );
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
    purpose: "vault",
  });

  return NextResponse.json(options);
}
