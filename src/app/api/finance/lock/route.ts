import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { lockVault } from "@/lib/financeVault";

// POST /api/finance/lock — manually lock the vault right now
export async function POST() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  await lockVault();
  await supabase.from("audit_log").insert({
    user_id: user.id, action: "vault_locked", metadata: { manual: true },
  });

  return NextResponse.json({ ok: true });
}
