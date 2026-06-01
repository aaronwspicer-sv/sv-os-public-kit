// GET  /api/time-blocks?days=30  — fetch recent blocks
// POST /api/time-blocks          — log a new block
// DELETE /api/time-blocks        — delete by id
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("time_blocks")
    .select("id, date, project, duration_m, notes, created_at")
    .eq("user_id", user.id)
    .gte("date", sinceStr)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  const project = String(body.project ?? "").trim();
  const duration_m = Math.round(Number(body.duration_m));
  const date = body.date ?? new Date().toISOString().slice(0, 10);

  if (!project) return NextResponse.json({ error: "project required" }, { status: 400 });
  if (!isFinite(duration_m) || duration_m <= 0) return NextResponse.json({ error: "duration_m must be > 0" }, { status: 400 });

  const { data, error } = await supabase
    .from("time_blocks")
    .insert({ user_id: user.id, project, duration_m, date, notes: body.notes ?? null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("time_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
