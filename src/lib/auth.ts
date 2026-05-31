// Centralized auth + owner-allowlist gate. Every API route should use
// requireOwner() instead of bare supabase.auth.getUser() to ensure
// authentication AND email allowlist are checked on every request.
// Defense-in-depth against middleware bypass or path-matcher gaps.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isAllowedEmail } from "@/lib/ownerAllowlist";

// Re-export so existing `import { isAllowedEmail } from "@/lib/auth"` callers
// don't break. The set itself now lives in @/lib/ownerAllowlist (edge-safe).
export { isAllowedEmail };

export type RequireOwnerResult =
  | { ok: true;  user: User; supabase: SupabaseClient; error: null }
  | { ok: false; user: null; supabase: null; error: NextResponse };

/**
 * Gate every API route with this. Returns either:
 *  - { ok: true, user, supabase } — proceed with authenticated, allowlisted user
 *  - { ok: false, error: NextResponse } — early-return this response
 *
 * Distinguishes 401 (no session) from 403 (session but not allowed).
 * On 403 it ALSO signs the offending session out so a leaked token can't
 * keep hammering API routes.
 */
export async function requireOwner(): Promise<RequireOwnerResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false, user: null, supabase: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAllowedEmail(user.email)) {
    // Burn the session so this token can't be reused
    await supabase.auth.signOut().catch(() => {});
    return {
      ok: false, user: null, supabase: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user, supabase, error: null };
}
