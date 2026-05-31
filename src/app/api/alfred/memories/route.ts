// CRUD for Alfred's long-term memories.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { saveMemory } from "@/lib/alfred/memory";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const search = req.nextUrl.searchParams.get("q");
  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? 100)));

  let q = supabase.from("alfred_memories")
    .select("id, kind, content, importance, tag, created_at, last_recalled_at, recall_count")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) q = q.ilike("content", `%${search}%`);
  const { data } = await q;
  return NextResponse.json({ count: data?.length ?? 0, memories: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  if (!body?.content || typeof body.content !== "string") {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }
  const r = await saveMemory(supabase, user.id, {
    content: body.content,
    kind: "explicit",
    importance: typeof body.importance === "number" ? body.importance : 5,
    tag: typeof body.tag === "string" ? body.tag : null,
  });
  if (!r) return NextResponse.json({ error: "Failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: r.id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("alfred_memories").delete().eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
