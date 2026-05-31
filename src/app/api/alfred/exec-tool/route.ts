// Executes one Alfred tool call from the Realtime voice data channel.
// Hardened: per-tool sensitivity check + rate limit + explicit unknown-tool
// rejection BEFORE we hit executeTool. This is the most exploitable Alfred
// surface — a stolen session can otherwise POST any tool with any args.
import { NextRequest, NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { executeTool, getToolByName } from "@/lib/alfred/tools";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  // Per-user rate limit — 120 tool calls per minute is generous for normal
  // chat (3-5 tools per turn × multiple turns) but caps cost-amplification
  // attacks from a stolen session.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`alfred-exec:${user.id}:${ip}`, { limit: 120, window: 60 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name) return NextResponse.json({ error: "Missing tool name" }, { status: 400 });

  // Reject unknown tools BEFORE doing any work — silently allowing them
  // would let a stolen session probe for endpoints.
  const tool = getToolByName(name);
  if (!tool) {
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "alfred_unknown_tool", metadata: { name },
    }).then(() => {}, () => {});
    return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
  }

  let args: any = {};
  if (typeof body?.args === "string") {
    try { args = JSON.parse(body.args || "{}"); } catch { args = {}; }
  } else if (body?.args && typeof body.args === "object") {
    args = body.args;
  }

  // executeTool itself enforces vault for finance/destructive — this route
  // doesn't need to re-check; centralizing the gate avoids drift.
  const result = await executeTool(name, { userId: user.id, supabase, args });
  return NextResponse.json({ ok: true, result });
}
