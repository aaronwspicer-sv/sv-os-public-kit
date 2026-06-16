// Undo for autonomous actions (Phase 3 — amber/reversibility). Green actions
// Alfred takes on its own are additive, so "undo" is a clean delete of what it
// created. The ledger stores an undo_token (the created row's id); the activity
// feed calls runUndo to reverse it. Only tools with a handler here are ever
// marked reversible in the feed.
import type { SupabaseClient } from "@supabase/supabase-js";

type UndoHandler = (sb: SupabaseClient, userId: string, token: string) => Promise<boolean>;

const UNDO_HANDLERS: Record<string, UndoHandler> = {
  // Alfred added a task → undo deletes it.
  add_todo: async (sb, userId, token) => {
    const { error } = await sb.from("daily_todos").delete().eq("id", token).eq("user_id", userId);
    return !error;
  },
  // Alfred saved a memory → undo deletes it.
  remember: async (sb, userId, token) => {
    const { error } = await sb.from("alfred_memories").delete().eq("id", token).eq("user_id", userId);
    return !error;
  },
};

/** Extract the undo token (the created row id) from a tool's output, if the
 *  tool is one we know how to reverse. Returns null when not undoable. */
export function undoTokenFor(tool: string, out: any): string | null {
  if (!out || typeof out !== "object" || !(tool in UNDO_HANDLERS)) return null;
  switch (tool) {
    case "add_todo": return out.todo?.id ?? null;
    case "remember": return out.id ?? null;
    default:         return null;
  }
}

export function isUndoableTool(tool: string): boolean {
  return tool in UNDO_HANDLERS;
}

export async function runUndo(
  sb: SupabaseClient,
  userId: string,
  action: { tool: string; undo_token: string | null },
): Promise<boolean> {
  const handler = UNDO_HANDLERS[action.tool];
  if (!handler || !action.undo_token) return false;
  return handler(sb, userId, action.undo_token);
}
