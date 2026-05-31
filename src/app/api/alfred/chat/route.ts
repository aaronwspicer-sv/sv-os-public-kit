// Alfred chat endpoint. Streams the assistant's response as SSE.
// Persists the full conversation (user + assistant + tool messages) so
// future turns have context and Settings can show conversation history.
import { NextRequest } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { runChatStream } from "@/lib/alfred/runChat";
import { maybeSummarizeTurn } from "@/lib/alfred/memory";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  if (!process.env.OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), { status: 500 });
  }

  // Rate limit: 60 chat requests per minute per user+IP — generous for normal
  // chat (fast back-and-forth ok), tight enough to cap cost-amplification
  // from a stolen session.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`alfred-chat:${user.id}:${ip}`, { limit: 60, window: 60 });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.message) {
    return new Response(JSON.stringify({ error: "Missing message" }), { status: 400 });
  }

  let conversationId: string | null = body.conversationId ?? null;

  // Create conversation if first turn
  if (!conversationId) {
    const title = String(body.message).slice(0, 60);
    const { data: conv } = await supabase
      .from("alfred_conversations")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    conversationId = conv?.id ?? null;
  } else {
    // Bump updated_at
    await supabase.from("alfred_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId).eq("user_id", user.id);
  }

  // Load history (last 20 messages, oldest → newest)
  const { data: priorRows } = await supabase
    .from("alfred_messages")
    .select("role, content, tool_calls, tool_call_id, tool_name")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(20);

  const history = (priorRows ?? []).map(r => ({
    role: r.role as any,
    content: r.content,
    ...(r.tool_calls ? { tool_calls: r.tool_calls } : {}),
    ...(r.tool_call_id ? { tool_call_id: r.tool_call_id, name: r.tool_name } : {}),
  }));

  // Persist the user message
  await supabase.from("alfred_messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: String(body.message),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        send({ kind: "meta", conversationId });
        let assistantText = "";
        // Validate images: max 4, each must be a data URL, max ~5MB encoded
        const rawImages = Array.isArray(body.images) ? body.images : [];
        const imageDataUrls: string[] = rawImages
          .filter((s: any) => typeof s === "string" && s.startsWith("data:image/") && s.length < 7_000_000)
          .slice(0, 4);

        for await (const evt of runChatStream({
          userId: user.id,
          supabase,
          history,
          userMessage: String(body.message),
          model: typeof body.model === "string" ? body.model : undefined,
          imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
        })) {
          if (evt.kind === "text") {
            assistantText += evt.data;
            send({ kind: "text", data: evt.data });
          } else if (evt.kind === "phase" || evt.kind === "tool_start" || evt.kind === "tool_end") {
            send(evt);
          } else if (evt.kind === "done") {
            // Persist final assistant message
            await supabase.from("alfred_messages").insert({
              conversation_id: conversationId,
              user_id: user.id,
              role: "assistant",
              content: assistantText || (evt.data?.content ?? ""),
            });
            send({ kind: "done" });
            // Fire-and-forget: extract durable memories from the last few turns.
            // Awaited only after `done` is sent so it doesn't delay UX.
            if (conversationId) {
              maybeSummarizeTurn(supabase, user.id, conversationId).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        send({ kind: "error", data: err?.message ?? "Server error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
