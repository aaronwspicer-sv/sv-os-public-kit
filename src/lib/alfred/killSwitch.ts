// Per-user kill switch for Alfred. If alfred_disabled=true in alfred_settings,
// EVERY Alfred endpoint refuses with 503. Use when something looks
// compromised — Alfred goes silent, the rest of the OS keeps running.
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export interface KillCheck { ok: boolean; reason?: string }

export async function requireAlfredEnabled(sb: SupabaseClient, userId: string): Promise<KillCheck> {
  const { data } = await sb
    .from("alfred_settings")
    .select("alfred_disabled, disabled_reason")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.alfred_disabled) {
    return { ok: false, reason: data.disabled_reason ?? "Alfred is disabled by panic switch" };
  }
  return { ok: true };
}

export function killSwitchResponse(reason: string) {
  return NextResponse.json(
    { error: `Alfred disabled — ${reason}`, code: "alfred_killed" },
    { status: 503 },
  );
}

/** Combined gate: requireOwner + Alfred kill-switch check. Use at the top of
 *  every Alfred endpoint so the panic switch is one source of truth. */
export type AlfredGate =
  | { ok: true; user: User; supabase: SupabaseClient; error: null }
  | { ok: false; user: null; supabase: null; error: NextResponse };

export async function requireAlfred(): Promise<AlfredGate> {
  const gate = await requireOwner();
  if (!gate.ok) return gate;
  const k = await requireAlfredEnabled(gate.supabase, gate.user.id);
  if (!k.ok) return { ok: false, user: null, supabase: null, error: killSwitchResponse(k.reason ?? "disabled") };
  return gate;
}
