// Master opt-in for Autonomous Alfred (Phase 0 "cage"). Reads the
// alfred_settings.autonomy_enabled flag. The autonomous loop (later phases)
// must check this before taking ANY action; when false, Alfred still chats and
// reports, it just doesn't act on its own. Distinct from the alfred_disabled
// panic switch (which silences Alfred entirely).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function isAutonomyEnabled(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await sb
    .from("alfred_settings")
    .select("autonomy_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return !!data?.autonomy_enabled;
}
