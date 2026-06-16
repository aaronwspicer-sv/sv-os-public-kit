// The red gate. Approve or deny a proposed outbound action. On approve, the
// payload is egress-scanned and then executed with origin 'exec' (the only path
// that runs a red tool — the autonomous loop is structurally blocked from it).
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { executeTool } from "@/lib/alfred/tools";
import { scanEgress } from "@/lib/alfred/egress";

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const actionId = typeof body?.actionId === "string" ? body.actionId : null;
  const decision = body?.decision === "approve" ? "approve" : body?.decision === "deny" ? "deny" : null;
  if (!actionId || !decision) {
    return NextResponse.json({ error: "actionId + decision (approve|deny) required" }, { status: 400 });
  }

  const { data: action } = await supabase
    .from("alfred_actions")
    .select("id, tool, payload, status")
    .eq("id", actionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (action.status !== "proposed") {
    return NextResponse.json({ error: "Not a pending proposal" }, { status: 400 });
  }

  if (decision === "deny") {
    await supabase.from("alfred_actions").update({ status: "denied" }).eq("id", actionId).eq("user_id", user.id);
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "alfred_proposal_denied", metadata: { tool: action.tool },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, decision: "deny" });
  }

  // Approve — egress-scan the payload's text before anything leaves.
  const payload = (action.payload ?? {}) as Record<string, any>;
  const scan = scanEgress(String(payload.body ?? payload.text ?? ""));
  if (!scan.ok) {
    return NextResponse.json(
      { error: "Egress wall blocked this — edit before sending.", reasons: scan.reasons },
      { status: 422 },
    );
  }

  const out = await executeTool(action.tool, {
    userId: user.id, supabase, args: payload, origin: "exec", skipLedger: true,
  });
  if (out && typeof out === "object" && "error" in out) {
    return NextResponse.json({ error: (out as any).error ?? "Execution failed" }, { status: 500 });
  }

  await supabase.from("alfred_actions").update({ status: "done" }).eq("id", actionId).eq("user_id", user.id);
  await supabase.from("audit_log").insert({
    user_id: user.id, action: "alfred_proposal_approved", metadata: { tool: action.tool },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, decision: "approve" });
}
