// GET — current kill-switch state.
// POST { disabled: bool, reason?: string } — flip the switch.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;
  const { data } = await supabase
    .from("alfred_settings")
    .select("alfred_disabled, disabled_reason, disabled_at")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({
    disabled: !!data?.alfred_disabled,
    reason:   data?.disabled_reason ?? null,
    at:       data?.disabled_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const disabled = !!body?.disabled;
  const reason   = typeof body?.reason === "string" ? body.reason.slice(0, 300) : null;

  const row = {
    user_id:         user.id,
    alfred_disabled: disabled,
    disabled_reason: disabled ? (reason ?? "Manually disabled in Settings") : null,
    disabled_at:     disabled ? new Date().toISOString() : null,
    updated_at:      new Date().toISOString(),
  };
  const { error } = await supabase
    .from("alfred_settings")
    .upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action:  disabled ? "alfred_disabled" : "alfred_enabled",
    metadata: { reason },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, disabled });
}
