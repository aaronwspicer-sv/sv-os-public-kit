// Persist voice-mode turns into alfred_messages so they show up in
// conversation history the same as text turns. Called from the client
// when a Realtime session disconnects (or batched as turns complete).
import { NextRequest, NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { maybeSummarizeTurn } from "@/lib/alfred/memory";
import { checkRateLimit } from "@/lib/rateLimit";

interface TurnIn { role: "user" | "assistant"; content: string }

export async function POST(req: NextRequest) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`alfred-persist:${user.id}:${ip}`, { limit: 30, window: 60 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const turns: TurnIn[] = Array.isArray(body.turns) ? body.turns.filter(
    (t: any) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim(),
  ) : [];
  if (turns.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  let conversationId: string | null = typeof body.conversationId === "string" ? body.conversationId : null;
  if (!conversationId) {
    const firstText = turns.find(t => t.role === "user")?.content ?? turns[0].content;
    const title = `🎙 ${firstText.slice(0, 50)}`;
    const { data: conv } = await supabase
      .from("alfred_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    conversationId = conv?.id ?? null;
  } else {
    await supabase.from("alfred_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId).eq("user_id", user.id);
  }
  if (!conversationId) return NextResponse.json({ error: "Could not create conversation" }, { status: 500 });

  const rows = turns.map(t => ({
    conversation_id: conversationId,
    user_id:         user.id,
    role:            t.role,
    content:         t.content.slice(0, 30_000),
  }));
  const { error } = await supabase.from("alfred_messages").insert(rows);
  if (error) {
    console.error("persist voice turns failed:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Fire-and-forget summarizer so durable facts get saved to long-term memory
  maybeSummarizeTurn(supabase, user.id, conversationId).catch(() => {});

  return NextResponse.json({ ok: true, inserted: rows.length, conversationId });
}
