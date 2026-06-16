// Alfred's people directory — everyone Aaron has introduced Alfred to.
// Loaded on every turn and injected into the system prompt so Alfred
// can recognize and greet people by name, know their relationship to
// Aaron, and respect their trust level.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonRow {
  id: string;
  name: string;
  relationship: string;
  context: string;
  trust_level: "trusted" | "guest_only";
  can_query_data: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export async function fetchPeople(sb: SupabaseClient, userId: string): Promise<PersonRow[]> {
  const { data } = await sb
    .from("alfred_people")
    .select("id, name, relationship, context, trust_level, can_query_data, last_seen_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export function formatPeopleForPrompt(people: PersonRow[]): string {
  if (people.length === 0) return "";
  const lines = people.map(p => {
    const access = p.can_query_data ? "can see Aaron's data" : "no data access";
    const trust  = p.trust_level === "trusted" ? "trusted" : "session guest only";
    const ctx    = p.context ? ` — ${p.context}` : "";
    return `• ${p.name} (${p.relationship})${ctx} [${trust}, ${access}]`;
  });
  return `\n────────── PEOPLE ALFRED KNOWS ──────────
${lines.join("\n")}
─────────────────────────────────────────\n`;
}
