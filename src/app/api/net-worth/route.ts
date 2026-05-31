import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

// Intentionally does NOT require finance vault unlock — the home dashboard
// always shows net worth, and the vault gate only covers detailed account views.
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const [{ data: bank }, { data: manual }] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("balance, category")
        .eq("user_id", user.id),
      supabase
        .from("manual_accounts")
        .select("balance, account_type")
        .eq("user_id", user.id),
    ]);

    let netWorth = 0;
    for (const a of (bank ?? [])) {
      const cat = String(a.category ?? "").toLowerCase();
      const sign = (cat === "credit_card" || cat === "loan") ? -1 : 1;
      netWorth += sign * Number(a.balance ?? 0);
    }
    for (const a of (manual ?? [])) {
      const sign = String(a.account_type ?? "").toLowerCase().includes("liab") ? -1 : 1;
      netWorth += sign * Number(a.balance ?? 0);
    }

    return NextResponse.json({ netWorth: Math.round(netWorth * 100) / 100 });
  } catch (error: any) {
    console.error("Net worth error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
