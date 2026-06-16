// The EXECUTOR half of the reader/executor split. It takes the reader's
// proposals and independently decides what runs. It executes ONLY green
// allow-listed actions; anything else is recorded as a queued proposal and
// left for later phases (amber undo / red approval). The reader never reaches
// a tool directly — every action passes through this gate.
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, getToolByName } from "../tools";
import { recordAction, classifyTier, boundaryOf } from "../actions";
import { isExecutableGreen, summarizeAction } from "./greenActions";
import { undoTokenFor, isUndoableTool } from "./undo";
import type { ProposedAction } from "./reader";

// Circuit breaker — never fire more than this many autonomous actions in a
// single pass, regardless of how many the reader proposed.
const MAX_ACTIONS_PER_PASS = 5;

export interface ExecutionResult {
  executed: number;
  queued: number;
  failed: number;
}

export async function executePlan(
  sb: SupabaseClient,
  userId: string,
  actions: ProposedAction[],
): Promise<ExecutionResult> {
  let executed = 0, queued = 0, failed = 0;

  for (const a of actions.slice(0, MAX_ACTIONS_PER_PASS)) {
    // Not green-executable → queue it as a proposal (visible in the feed),
    // don't run it. Later phases turn these into undo/approval flows.
    if (!isExecutableGreen(a.tool)) {
      const t = getToolByName(a.tool);
      await recordAction(sb, userId, {
        tool: a.tool,
        tier: t ? (classifyTier(t) ?? "amber") : "amber",
        boundary: t ? boundaryOf(t) : "internal",
        origin: "autonomous",
        status: "proposed",
        justification: a.justification,
        summary: a.args?.title ? `Proposed: ${a.args.title}` : `Proposed (needs approval): ${a.tool}`,
        payload: a.args,
      });
      queued++;
      continue;
    }

    // Green — execute. skipLedger because we write our own enriched row below.
    const out = await executeTool(a.tool, {
      userId, supabase: sb, args: a.args, origin: "autonomous", skipLedger: true,
    });
    const ok = !(out && typeof out === "object" && "error" in out);
    if (ok) executed++; else failed++;

    const undoToken = ok ? undoTokenFor(a.tool, out) : null;
    await recordAction(sb, userId, {
      tool: a.tool,
      tier: "green",
      boundary: "internal",
      origin: "autonomous",
      status: ok ? "done" : "failed",
      justification: a.justification,
      summary: summarizeAction(a.tool, a.args),
      reversible: isUndoableTool(a.tool) && !!undoToken,
      undoToken: undoToken ?? undefined,
    });
  }

  return { executed, queued, failed };
}
