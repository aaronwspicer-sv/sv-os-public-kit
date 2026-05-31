import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearTwoFa } from "@/lib/twofa";

// Server-side logout: signs out of Supabase, clears the 2FA cookie,
// audits the action. Called from the client just before client-side
// signOut so the 2FA cookie is gone before redirect.
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      try {
        await supabase.from("audit_log").insert({ user_id: user.id, action: "logout" });
      } catch {}
    }
    await clearTwoFa();
    await supabase.auth.signOut();
  } catch {}
  return NextResponse.json({ ok: true });
}
