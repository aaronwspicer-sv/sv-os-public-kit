// Step 1 of passkey registration: issue a challenge.
// Auth-gated (requireOwner). Stores challenge server-side so we can verify it later.
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { requireOwner } from "@/lib/auth";
import { RP_NAME, resolveRpID } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const rpID = resolveRpID(req.headers.get("origin"));

  // Don't let the same key register twice — exclude existing credentials
  const { data: existing } = await supabase
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? "Owner",
    attestationType: "none",
    excludeCredentials: (existing ?? []).map(c => ({
      id: c.credential_id,
      transports: (c.transports ?? undefined) as any,
    })),
    authenticatorSelection: {
      // "preferred" lets both platform (Touch/Face ID) AND roaming keys + phone-as-authenticator work
      residentKey: "preferred",
      userVerification: "preferred",
    },
    // Common COSE algorithms (Ed25519, ES256, RS256)
    supportedAlgorithmIDs: [-8, -7, -257],
  });

  // Persist challenge — single-use, 5 min TTL on cleanup
  await supabase.from("webauthn_challenges").insert({
    user_id: user.id,
    challenge: options.challenge,
    purpose: "register",
  });

  return NextResponse.json(options);
}
