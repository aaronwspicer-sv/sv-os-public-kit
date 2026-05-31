// CSV import endpoint. Accepts multipart upload of a bank CSV, parses,
// dedupes, and writes to bank_transactions. One "manual" bank_item per
// bank label so accounts/transactions roll up cleanly in finances UI.
// Vault-gated.
import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { parseCsv, txHash } from "@/lib/import/csv";
import { suggestCategory } from "@/lib/import/categorize";

export const runtime = "nodejs";
export const maxDuration = 30;

const BANK_LABELS: Record<string, string> = {
  rbc: "RBC",
  td:  "TD",
};

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (file.size > 5_000_000)   return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 413 });

  const text = await file.text();
  const result = parseCsv(text, file.name);
  if (result.bank === "unknown" || result.transactions.length === 0) {
    return NextResponse.json({
      error: result.warnings[0] ?? "No transactions found in file",
      bank: result.bank,
      warnings: result.warnings,
    }, { status: 400 });
  }

  // Get-or-create a bank_item for this bank (provider='manual', identifier=bank slug)
  const institution = BANK_LABELS[result.bank] ?? result.bank.toUpperCase();
  const providerConnId = `manual:${result.bank}`;

  const { data: item, error: iErr } = await supabase
    .from("bank_items")
    .upsert({
      user_id: user.id,
      provider: "manual",
      provider_connection_id: providerConnId,
      institution,
      status: "active",
      last_refresh_at: new Date().toISOString(),
    }, { onConflict: "user_id,provider_connection_id" })
    .select("id")
    .single();
  if (iErr || !item) {
    console.error("bank_items upsert failed:", iErr?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const itemId = item.id;

  // One implicit account per (bank, rawAccount label). Most files have 1 account.
  // For TD, the parser also extracts the latest running balance — apply it
  // to the account so net worth is accurate without manual entry.
  const accountCache = new Map<string, string>();
  async function getAccountId(rawAccount: string, category: string, currency: string): Promise<string | null> {
    if (accountCache.has(rawAccount)) return accountCache.get(rawAccount)!;
    const provAcctId = `manual:${result.bank}:${rawAccount || "default"}`;
    const upsert: any = {
      user_id: user.id,
      item_id: itemId,
      provider_account_id: provAcctId,
      name: rawAccount || institution,
      institution,
      category,
      currency,
      updated_at: new Date().toISOString(),
    };
    // Auto-apply latest balance when the parser gave us one (TD)
    const balanceKey = rawAccount || "default";
    if (result.latestBalances[balanceKey] !== undefined) {
      upsert.balance = result.latestBalances[balanceKey];
    }
    const { data: acct } = await supabase
      .from("bank_accounts")
      .upsert(upsert, { onConflict: "user_id,provider_account_id" })
      .select("id")
      .single();
    if (!acct) return null;
    accountCache.set(rawAccount, acct.id);
    return acct.id;
  }

  let inserted = 0, skipped = 0;
  for (const t of result.transactions) {
    const accountLabel = t.rawAccount ?? "default";
    const category = /chequ|cheq/i.test(t.rawType ?? "") ? "checking"
                   : /sav/i.test(t.rawType ?? "")        ? "savings"
                   : /credit|visa|mc/i.test(t.rawType ?? "") ? "credit_card"
                   : "checking";
    const accountId = await getAccountId(accountLabel, category, t.currency);
    if (!accountId) continue;

    const txId = txHash(t, result.bank);
    const { error } = await supabase.from("bank_transactions").upsert({
      user_id:        user.id,
      account_id:     accountId,
      provider_tx_id: txId,
      date:           t.date,
      description:    t.description,
      amount:         t.amount,
      currency:       t.currency,
      suggested_category: suggestCategory(t.description, t.amount),
    }, { onConflict: "user_id,provider_tx_id", ignoreDuplicates: false });
    if (error) skipped++;
    else inserted++;
  }

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "bank_csv_import",
    metadata: { bank: result.bank, file: file.name, parsed: result.transactions.length, inserted, skipped },
  }).then(() => {}, () => {});

  return NextResponse.json({
    ok: true,
    bank: institution,
    parsed: result.transactions.length,
    inserted,
    skipped,
    warnings: result.warnings,
  });
}
