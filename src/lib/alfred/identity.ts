// Fetches Alfred's identity = the latest SV-GPT skill content from the DB.
// This is THE source of truth for who Alfred is. Edit it in Settings →
// SV-GPT, and Alfred is instantly different on the next conversation.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SkillRow {
  id: string;
  version: number;
  content: string;
  created_at: string;
  edited_by: string | null;
}

export async function fetchActiveSkill(sb: SupabaseClient, userId: string): Promise<SkillRow | null> {
  const { data } = await sb
    .from("sv_gpt_skill")
    .select("id, version, content, created_at, edited_by")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function fetchSkillHistory(sb: SupabaseClient, userId: string): Promise<SkillRow[]> {
  const { data } = await sb
    .from("sv_gpt_skill")
    .select("id, version, content, created_at, edited_by")
    .eq("user_id", userId)
    .order("version", { ascending: false })
    .limit(20);
  return data ?? [];
}

export async function appendSkillVersion(sb: SupabaseClient, userId: string, content: string, editedBy: string): Promise<number> {
  const current = await fetchActiveSkill(sb, userId);
  const nextVer = (current?.version ?? 0) + 1;
  const { error } = await sb.from("sv_gpt_skill").insert({
    user_id: userId,
    version: nextVer,
    content,
    edited_by: editedBy,
  });
  if (error) throw new Error(error.message);
  return nextVer;
}
