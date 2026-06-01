import { NextRequest } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";

export const runtime = "nodejs";

// PATCH /api/alfred/conversations/[id] — rename a conversation
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.slice(0, 80).trim() : null;
  if (!title) return new Response(JSON.stringify({ error: "title required" }), { status: 400 });

  const { error } = await supabase
    .from("alfred_conversations")
    .update({ title })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return Response.json({ ok: true });
}

// DELETE /api/alfred/conversations/[id] — delete a conversation
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await params;
  const { error } = await supabase
    .from("alfred_conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return Response.json({ ok: true });
}
