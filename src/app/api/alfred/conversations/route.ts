import { requireAlfred } from "@/lib/alfred/killSwitch";

export const runtime = "nodejs";

// GET /api/alfred/conversations — list user's conversations, newest first
export async function GET() {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase
    .from("alfred_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Attach last message preview for each conversation
  const withPreviews = await Promise.all((data ?? []).map(async conv => {
    const { data: last } = await supabase
      .from("alfred_messages")
      .select("role, content")
      .eq("conversation_id", conv.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    return { ...conv, preview: last?.content?.slice(0, 80) ?? null, previewRole: last?.role ?? null };
  }));

  return Response.json({ conversations: withPreviews });
}
