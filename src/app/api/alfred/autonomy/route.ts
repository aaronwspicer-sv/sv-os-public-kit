// Get/set the Autonomous Alfred master opt-in.
// Stored on alfred_settings.autonomy_enabled. Defaults false. This is the
// "stand down" / "go autonomous" switch — separate from the panic kill switch.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;
  const { data } = await supabase
    .from("alfred_settings")
    .select("autonomy_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({ autonomy_enabled: !!data?.autonomy_enabled });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const enabled = !!body?.enabled;

  const { error } = await supabase
    .from("alfred_settings")
    .upsert(
      { user_id: user.id, autonomy_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action:  enabled ? "alfred_autonomy_enabled" : "alfred_autonomy_disabled",
    metadata: {},
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, autonomy_enabled: enabled });
}
