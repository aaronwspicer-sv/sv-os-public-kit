import { NextRequest } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";

export const runtime = "nodejs";

// GET /api/alfred/conversations/[id]/messages — load messages for a thread
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await params;

  // Verify ownership
  const { data: conv } = await supabase
    .from("alfred_conversations")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!conv) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const { data: messages } = await supabase
    .from("alfred_messages")
    .select("id, role, content, tool_name, created_at")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(100);

  return Response.json({ conversation: conv, messages: messages ?? [] });
}
