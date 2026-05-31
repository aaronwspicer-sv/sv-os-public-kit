// List + confirm bank transactions. Vault-gated.
// POST mirrors the old Plaid/Flinks confirm flow (Notion ledger write).
import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { confirmTransaction } from "@/lib/bank/confirmTransaction";

export async function GET(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const onlyUnreviewed = req.nextUrl.searchParams.get("unreviewed") === "1";
  const limit = Math.max(1, Math.min(500, Number(req.nextUrl.searchParams.get("limit") ?? 100)));

  let q = supabase.from("bank_transactions")
    .select("id, account_id, provider_tx_id, date, description, merchant_name, amount, currency, category, suggested_category, confirmed_at, notion_page_id, created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(limit);
  if (onlyUnreviewed) q = q.is("confirmed_at", null);
  const { data } = await q;

  // Shape-compatible with the old Plaid response so the finances page UI
  // keeps working without per-field renames.
  const transactions = (data ?? []).map(r => ({
    ...r,
    plaid_transaction_id: r.id,
    merchant_name: r.merchant_name ?? r.description ?? null,
  }));
  return NextResponse.json({ count: transactions.length, transactions });
}

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const id = String(body.transactionId ?? body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

  const result = await confirmTransaction(supabase, user.id, {
    id,
    category: String(body.category ?? "Other Personal").slice(0, 80),
    transactionType: body.transactionType,
    businessPct: typeof body.businessPct === "number" ? body.businessPct : 0,
    notes: typeof body.notes === "string" ? body.notes : "",
    fromAccountPageId: typeof body.fromAccountPageId === "string" && body.fromAccountPageId ? body.fromAccountPageId : null,
    toAccountPageId:   typeof body.toAccountPageId   === "string" && body.toAccountPageId   ? body.toAccountPageId   : null,
    splitSavePct:  typeof body.splitSavePct  === "number" ? body.splitSavePct  : undefined,
    splitSpendPct: typeof body.splitSpendPct === "number" ? body.splitSpendPct : undefined,
    splitTaxPct:   typeof body.splitTaxPct   === "number" ? body.splitTaxPct   : undefined,
  });
  if (!result.ok) {
    // Pass the real Notion error through (e.g. "Could not find property
    // with name or id: Split Save %") so the UI can show it.
    return NextResponse.json({ error: result.error }, { status: result.error === "Transaction not found" ? 404 : 502 });
  }

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "bank_tx_confirmed",
    metadata: { id, category: body.category },
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true });
}
