import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";

// Raw idea capture — separate from the SV Videos pipeline.
// GET    /api/ideas        list all (newest first), can filter ?promoted=false
// POST   /api/ideas        { text, source? }       create
// DELETE /api/ideas        { id }                  delete
// PATCH  /api/ideas        { id, text? }           edit
// POST   /api/ideas/promote { id, pillar?, type? } create Notion SV Videos entry, mark row promoted

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const promotedParam = req.nextUrl.searchParams.get("promoted");
  let q = supabase.from("idea_inbox").select("*").eq("user_id", user.id);
  if (promotedParam === "true")  q = q.eq("promoted", true);
  if (promotedParam === "false") q = q.eq("promoted", false);
  q = q.order("created_at", { ascending: false }).limit(200);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ideas: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { text, source = "inbox" } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Text required" }, { status: 400 });

  const { data, error } = await supabase
    .from("idea_inbox")
    .insert({ user_id: user.id, text: text.trim(), source })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ idea: data });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id, text } = await req.json();
  if (!id || !text?.trim()) return NextResponse.json({ error: "Missing id or text" }, { status: 400 });

  const { error } = await supabase
    .from("idea_inbox")
    .update({ text: text.trim() })
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

  await supabase.from("idea_inbox").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}

// Sub-route handler at /api/ideas/promote done in its own file
export const dynamic = "force-dynamic";
void notion; void DB;
