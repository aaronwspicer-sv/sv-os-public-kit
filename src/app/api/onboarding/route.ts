// First-login wizard state.
//   GET  → { onboarded: boolean, tier: string | null }
//   POST → mark onboarded { tier } (upserts alfred_settings row)
// Owner-gated. The wizard is UX, not a security boundary (auth is already
// enforced server-side), so this just persists "been through it".
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";

const TIERS = ["quick", "full", "power"] as const;

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data } = await supabase
    .from("alfred_settings")
    .select("onboarded_at, onboarding_tier")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    onboarded: !!data?.onboarded_at,
    tier: data?.onboarding_tier ?? null,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  const tier = TIERS.includes(body?.tier) ? body.tier : "quick";

  try {
    // Upsert — the row may not exist yet (alfred_settings is created lazily).
    const { error } = await supabase
      .from("alfred_settings")
      .upsert(
        {
          user_id: user.id,
          onboarded_at: new Date().toISOString(),
          onboarding_tier: tier,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true, tier });
  } catch (err) {
    captureError(err, { area: "onboarding", action: "mark_done", route: "/api/onboarding", userId: user.id });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
