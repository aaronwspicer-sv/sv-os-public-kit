// Update the balance of one bank account manually (for RBC, where the CSV
// doesn't include running balance). Vault-gated.
import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const id      = String(body?.id ?? "");
  const balance = Number(body?.balance);
  if (!id) return NextResponse.json({ error: "Missing account id" }, { status: 400 });
  if (!Number.isFinite(balance)) return NextResponse.json({ error: "Balance must be a number" }, { status: 400 });

  const { error } = await supabase.from("bank_accounts")
    .update({ balance, updated_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "bank_balance_manual_update",
    metadata: { id, balance },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
