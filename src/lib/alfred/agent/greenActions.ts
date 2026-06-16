// The autonomous executor's allow-list. In Phase 1 Alfred may take ONLY these
// actions on its own — all additive, internal, and reversible. Everything else
// a plan proposes is queued (status 'proposed'), never executed. This is the
// structural guarantee: the autonomous loop cannot fire amber/red, no matter
// what the reader proposes (or is tricked into proposing).
import { getToolByName } from "../tools";
import { classifyTier, boundaryOf } from "../actions";

export const GREEN_AUTONOMOUS_TOOLS = new Set<string>([
  "add_todo",        // surface a prep task (reversible via delete)
  "remember",        // note a durable pattern into long-term memory
  "save_note",       // capture a short note / day-plan
  "pipeline_create", // drop a self-doc content draft into the pipeline (Phase 2)
]);

/** Defense in depth: a tool is autonomously executable ONLY if it's on the
 *  allow-list AND independently classifies green + internal + non-money. The
 *  allow-list and the tier check must BOTH pass. */
export function isExecutableGreen(toolName: string): boolean {
  if (!GREEN_AUTONOMOUS_TOOLS.has(toolName)) return false;
  const t = getToolByName(toolName);
  if (!t) return false;
  if (t.movesMoney === true) return false;
  if (boundaryOf(t) !== "internal") return false;
  return classifyTier(t) === "green";
}

/** Human-readable one-liner for the activity feed. */
export function summarizeAction(tool: string, args: Record<string, any>): string {
  const clip = (s: any, n = 90) => String(s ?? "").slice(0, n);
  switch (tool) {
    case "add_todo":  return `Added task: "${clip(args.text)}"`;
    case "remember":  return `Remembered: "${clip(args.content)}"`;
    case "save_note": return `Noted: "${clip(args.content)}"`;
    default:          return tool;
  }
}
