// Reverse a reversible autonomous action from the activity feed. Owner-gated.
// Looks up the ledger row, runs its undo handler (a clean delete of what Alfred
// created), and marks the row reversed.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { runUndo } from "@/lib/alfred/agent/undo";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const actionId = typeof body?.actionId === "string" ? body.actionId : null;
  if (!actionId) return NextResponse.json({ error: "actionId required" }, { status: 400 });

  const { data: action } = await supabase
    .from("alfred_actions")
    .select("id, tool, undo_token, reversible, reversed")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!action.reversible || action.reversed) {
    return NextResponse.json({ error: "Not reversible" }, { status: 400 });
  }

  const ok = await runUndo(supabase, user.id, { tool: action.tool, undo_token: action.undo_token });
  if (!ok) return NextResponse.json({ error: "Undo failed" }, { status: 500 });

  await supabase
    .from("alfred_actions")
    .update({ reversed: true, status: "reversed" })
    .eq("id", actionId)
    .eq("user_id", user.id);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "alfred_action_reversed",
    metadata: { actionId, tool: action.tool },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
