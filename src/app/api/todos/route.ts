import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getActiveDateString, getTomorrowDateString } from "@/lib/utils";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const today    = getActiveDateString();
  const tomorrow = getTomorrowDateString();

  // Auto-rollover: any incomplete todos dated BEFORE today get moved to today.
  // Handles orphans from the prior timezone bug + the normal "didn't finish yesterday" case.
  await supabase
    .from("daily_todos")
    .update({ date: today })
    .eq("user_id", user.id)
    .eq("done", false)
    .lt("date", today);

  const { data, error } = await supabase
    .from("daily_todos")
    .select("*")
    .eq("user_id", user.id)
    .in("date", [today, tomorrow])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const todayGoals    = (data ?? []).filter(t => t.date === today);
  const tomorrowGoals = (data ?? []).filter(t => t.date === tomorrow);

  return NextResponse.json({ todayGoals, tomorrowGoals });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { text, date } = await req.json();
  if (!text || !date) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data, error } = await supabase
    .from("daily_todos")
    .insert({ user_id: user.id, text, date, done: false, queued: false })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ todo: data });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Only allow safe fields
  const allowed: Record<string, any> = {};
  if ("done"   in updates) { allowed.done   = updates.done;   allowed.done_at = updates.done ? new Date().toISOString() : null; }
  if ("queued" in updates)   allowed.queued = updates.queued;
  if ("text"   in updates)   allowed.text   = updates.text;

  const { error } = await supabase
    .from("daily_todos")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("daily_todos")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
