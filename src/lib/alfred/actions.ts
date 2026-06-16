// Autonomous Alfred — the action layer (Phase 0 "cage").
//
// Classifies every tool into a reversibility/blast-radius tier and records
// state-changing actions to the alfred_actions ledger. None of this grants
// Alfred new power — it's the safety substrate the autonomous loop will ride
// on in later phases.
//
//   green  — internal + reversible (task reorg, memory writes, drafts)
//   amber  — internal but sensitive or hard to reverse (finance reads, deletes)
//   red    — outbound / irreversible (send, publish) — HUMAN-GATED, none exist yet
//
// HARD INVARIANT: Alfred cannot move money. There is no money-movement tool,
// and `assertNoMoneyMovement` (enforced at runtime + in tests) guarantees one
// can never be added by accident. Finance is read-only and vault-gated.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDef, ToolSensitivity } from "./tools";

export type ActionTier = "green" | "amber" | "red";
export type ActionBoundary = "internal" | "outbound";
export type ActionOrigin = "chat" | "voice" | "autonomous" | "exec";

/** Map a tool to its action tier. Returns null for pure reads (safe/external) —
 *  those are observations, not state-changing actions, so they aren't ledgered
 *  as actions. An explicit ToolDef.tier always wins over the derived default. */
export function classifyTier(tool: ToolDef): ActionTier | null {
  if (tool.tier) return tool.tier;
  if (tool.boundary === "outbound") return "red";
  switch (tool.sensitivity ?? "write") {
    case "destructive": return "amber";
    case "finance":     return "amber";
    case "write":       return "green";
    case "safe":        return null; // read-only observation
    case "external":    return null; // inbound read (tainted, but not an action)
    default:            return "green";
  }
}

export function boundaryOf(tool: ToolDef): ActionBoundary {
  return tool.boundary ?? "internal";
}

/** A tool's OUTPUT is tainted when it pulls from the open/untrusted world.
 *  Tainted data can inform a proposal but must never directly authorize a
 *  red/amber action — that propagation is enforced by the agent loop in later
 *  phases; here we expose the classifier the loop will use. */
export function isTaintedSource(tool: ToolDef): boolean {
  return (tool.sensitivity ?? "write") === "external";
}

/** THE money invariant. Alfred holds no capability to move money. This refuses
 *  any tool that declares (or back-doors in) a money-movement capability, so
 *  even a future mistake fails closed rather than shipping a live money tool. */
export function assertNoMoneyMovement(tools: ToolDef[]): void {
  const offenders = tools.filter(t => t.movesMoney === true);
  if (offenders.length > 0) {
    throw new Error(
      `Money-movement invariant violated: ${offenders.map(t => t.name).join(", ")}. ` +
      `Alfred must never be able to move money. Remove the capability.`,
    );
  }
}

export interface RecordActionInput {
  tool: string;
  tier: ActionTier;
  boundary: ActionBoundary;
  summary?: string;
  justification?: string;
  tainted?: boolean;
  taintSources?: string[];
  origin?: ActionOrigin;
  status?: "proposed" | "done" | "failed" | "denied" | "reversed";
  reversible?: boolean;
  undoToken?: string;
  /** For red proposals — the exact tool args to run if the owner approves. */
  payload?: Record<string, any>;
}

/** Append a row to the action ledger. Best-effort — a ledger write must never
 *  break the tool call it's recording, so failures are swallowed (and surfaced
 *  to logs). The feed is observability, not a transaction. */
export async function recordAction(
  sb: SupabaseClient,
  userId: string,
  a: RecordActionInput,
): Promise<void> {
  try {
    await sb.from("alfred_actions").insert({
      user_id:       userId,
      tool:          a.tool,
      tier:          a.tier,
      boundary:      a.boundary,
      summary:       a.summary ?? null,
      justification: a.justification ?? null,
      tainted:       a.tainted ?? false,
      taint_sources: a.taintSources ?? null,
      origin:        a.origin ?? "chat",
      status:        a.status ?? "done",
      reversible:    a.reversible ?? false,
      undo_token:    a.undoToken ?? null,
      payload:       a.payload ?? null,
    });
  } catch (err: any) {
    console.error("recordAction failed:", err?.message);
  }
}

// Re-export for callers that only need the sensitivity union.
export type { ToolSensitivity };
