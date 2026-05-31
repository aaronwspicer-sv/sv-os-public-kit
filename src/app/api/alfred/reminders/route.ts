// Get/set the weekly reconcile reminder day.
// Stored on alfred_settings.reconcile_reminder_dow (0=Sun..6=Sat, null=off).
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;
  const { data } = await supabase
    .from("alfred_settings")
    .select("reconcile_reminder_dow")
    .eq("user_id", user.id)
    .maybeSingle();
  return NextResponse.json({ reconcile_dow: data?.reconcile_reminder_dow ?? null });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const raw = body?.reconcile_dow;
  // null/undefined = off; 0..6 = day
  let dow: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "off") {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 6) {
      return NextResponse.json({ error: "dow must be 0–6 or 'off'/null" }, { status: 400 });
    }
    dow = n;
  }

  const { error } = await supabase.from("alfred_settings")
    .upsert({ user_id: user.id, reconcile_reminder_dow: dow, updated_at: new Date().toISOString() },
            { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "reconcile_reminder_set", metadata: { dow },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, reconcile_dow: dow });
}
