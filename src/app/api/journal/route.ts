// GET    /api/journal?date=YYYY-MM-DD  — fetch entry for a date (or today)
// GET    /api/journal?q=...&limit=20   — search entries
// POST   /api/journal                  — upsert today's entry
// DELETE /api/journal                  — delete by id
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const date  = req.nextUrl.searchParams.get("date");
  const q     = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(50, Number(req.nextUrl.searchParams.get("limit") ?? 20));

  if (q) {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, date, title, body, mood, tags, created_at, updated_at")
      .eq("user_id", user.id)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ entries: data ?? [] });
  }

  const target = date ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("journal_entries")
    .select("id, date, title, body, mood, tags, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("date", target)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data ?? null });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  const date  = body.date ?? new Date().toISOString().slice(0, 10);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : null;
  const text  = typeof body.body  === "string" ? body.body.slice(0, 50000) : "";
  const mood  = body.mood != null ? Math.max(1, Math.min(5, Number(body.mood))) : null;
  const tags  = Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean).slice(0, 10) : [];

  const { data, error } = await supabase
    .from("journal_entries")
    .upsert(
      { user_id: user.id, date, title, body: text, mood, tags, updated_at: new Date().toISOString() },
      { onConflict: "user_id,date" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
