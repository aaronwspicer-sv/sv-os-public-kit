import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { torontoTodayBounds } from "@/lib/torontoDay";

// Server-side draft for today's log so it syncs across devices without
// hitting Notion on every keystroke. Notion gets written only when Aaron
// presses the explicit "Save to Notion" button.
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { label } = torontoTodayBounds();
  const { data } = await supabase
    .from("log_drafts")
    .select("entry, updated_at")
    .eq("user_id", user.id)
    .eq("date", label)
    .maybeSingle();

  return NextResponse.json({
    date: label,
    entry: data?.entry ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { label } = torontoTodayBounds();
  const { error } = await supabase
    .from("log_drafts")
    .upsert({
      user_id: user.id,
      date: label,
      entry: body,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE — clear today's draft after a successful Notion save.
export async function DELETE() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { label } = torontoTodayBounds();
  await supabase
    .from("log_drafts")
    .delete()
    .eq("user_id", user.id)
    .eq("date", label);

  return NextResponse.json({ ok: true });
}
