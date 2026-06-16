// The "what Alfred did" feed — reads the alfred_actions ledger. Owner-gated,
// read-only. Powers /d/activity. Later phases add undo + proposal approval here.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 100)));

  const { data, error } = await supabase
    .from("alfred_actions")
    .select("id, tier, boundary, tool, summary, justification, tainted, origin, status, reversible, reversed, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}
