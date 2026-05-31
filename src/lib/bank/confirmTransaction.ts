// Shared Notion-Ledger write used by both the manual confirm endpoint
// (/api/bank/transactions POST) and Alfred's auto-categorize sweep.
// Centralizing means every confirm path fills the same 16 Ledger fields
// (Splits, FX, Tax Year relation, etc.) without drift.
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "@/config";

export type TxType = "Expense" | "Income" | "Transfer" | "Tax Payment";

/** Default save/spend/tax splits per transaction type. Extracted so it
 *  can be unit-tested without spinning up Supabase + Notion. */
export function defaultSplitsForType(type: TxType): { save: number; spend: number; tax: number } {
  switch (type) {
    case "Expense":     return { save: 0,    spend: 1.00, tax: 0    };
    case "Tax Payment": return { save: 0,    spend: 0,    tax: 1.00 };
    case "Income":      return { save: 0.20, spend: 0,    tax: 0.30 };
    case "Transfer":    return { save: 0,    spend: 0,    tax: 0    };
  }
}

/** Validation rule: Transfers must have BOTH From and To Account set.
 *  Returns null if valid, or an error message if not. Pure — testable. */
export function validateTransactionRelations(
  type: TxType,
  fromAccountPageId: string | null | undefined,
  toAccountPageId: string | null | undefined,
): string | null {
  if (type === "Transfer" && (!fromAccountPageId || !toAccountPageId)) {
    return "Transfers require both From Account and To Account. Pick both before confirming.";
  }
  return null;
}

export type ConfirmInput = {
  id: string;                  // bank_transactions.id
  category: string;
  transactionType?: "Expense" | "Income" | "Transfer" | "Tax Payment";
  businessPct?: number;        // 0..100
  notes?: string;
  fromAccountPageId?: string | null;
  toAccountPageId?: string | null;
  splitSavePct?: number;       // 0..100, overrides default
  splitSpendPct?: number;
  splitTaxPct?: number;
};

export async function confirmTransaction(
  supabase: SupabaseClient,
  userId: string,
  input: ConfirmInput,
): Promise<{ ok: true; notion_page_id: string | null } | { ok: false; error: string }> {
  const { data: tx } = await supabase
    .from("bank_transactions")
    .select("id, date, description, merchant_name, amount, currency, suggested_category")
    .eq("user_id", userId).eq("id", input.id).single();
  if (!tx) return { ok: false, error: "Transaction not found" };

  const category        = String(input.category ?? tx.suggested_category ?? "Other Personal").slice(0, 80);
  const transactionType = input.transactionType ?? "Expense";
  const businessPct     = Math.max(0, Math.min(100, Number(input.businessPct ?? 0)));
  const notes           = typeof input.notes === "string" ? input.notes.slice(0, 600) : "";
  const currency        = String(tx.currency ?? "CAD");

  // Account-relation sanity. The Notion Accounts rollups need:
  //   Expense / Tax Payment → From Account (Outflow rollup)
  //   Income                → To Account   (Inflow rollup)
  //   Transfer              → BOTH (Transfer Out via From, Transfer In via To)
  // Writing a Transfer without both halves silently corrupts balances.
  const relationError = validateTransactionRelations(
    transactionType,
    input.fromAccountPageId,
    input.toAccountPageId,
  );
  if (relationError) return { ok: false, error: relationError };

  const def = defaultSplitsForType(transactionType);
  const splitSave  = typeof input.splitSavePct  === "number" ? Math.max(0, Math.min(1, input.splitSavePct  / 100)) : def.save;
  const splitSpend = typeof input.splitSpendPct === "number" ? Math.max(0, Math.min(1, input.splitSpendPct / 100)) : def.spend;
  const splitTax   = typeof input.splitTaxPct   === "number" ? Math.max(0, Math.min(1, input.splitTaxPct   / 100)) : def.tax;

  let fxRate: number | null = null;
  if (currency === "USD") {
    const { getUsdToCad } = await import("@/lib/fxRate");
    fxRate = await getUsdToCad();
  }

  // Tax-year relation is a Canadian-specific feature — skip the Notion
  // lookup entirely when disabled (buyers without a Tax Years DB).
  let taxYearPageId: string | null = null;
  if (config.features.taxYear) {
    try {
      const { findTaxYearPageId } = await import("@/lib/taxYears");
      const year = Number(tx.date.slice(0, 4));
      if (Number.isFinite(year)) taxYearPageId = await findTaxYearPageId(year);
    } catch {}
  }

  try {
    const { notion, DB, resolveDataSourceId } = await import("@/lib/notion");
    // Normalize date to YYYY-MM-DD. Supabase can hand back "YYYY-MM-DD" for
    // a `date` column or "YYYY-MM-DDTHH:mm:ss…" for a timestamp — slicing
    // ensures Notion sees the transaction date, not the import datetime.
    const txDate = String(tx.date ?? "").slice(0, 10);
    const ledgerDsId = await resolveDataSourceId(DB.LEDGER);
    const page = await notion.pages.create({
      // v5 client: pages.create needs the data source ID, not the database ID.
      // resolveDataSourceId normalizes either form so envs that hold a DB ID
      // (like Log) still write to the right collection.
      parent: { data_source_id: ledgerDsId } as never,
      properties: {
        "Name":             { title: [{ text: { content: tx.merchant_name ?? tx.description ?? "Transaction" } }] },
        "Amount":           { number: Math.abs(Number(tx.amount)) },
        "Transaction Type": { select: { name: transactionType } },
        "Category":         { select: { name: category } },
        "Status":           { select: { name: "Cleared" } },
        "Date":             { date: { start: txDate } },
        "Business Use %":   { number: businessPct / 100 },
        "Currency":         { select: { name: currency } },
        "Split Save %":     { number: splitSave  },
        "Split Spend %":    { number: splitSpend },
        "Split Tax %":      { number: splitTax   },
        ...(fxRate          ? { "FX Rate (to CAD)":   { number: fxRate }                                    } : {}),
        ...(notes           ? { "Notes":              { rich_text: [{ text: { content: notes } }] }        } : {}),
        ...(input.fromAccountPageId ? { "From Account":      { relation: [{ id: input.fromAccountPageId }] } } : {}),
        ...(input.toAccountPageId   ? { "To Account":        { relation: [{ id: input.toAccountPageId   }] } } : {}),
        ...(taxYearPageId           ? { "Occurring Tax Year": { relation: [{ id: taxYearPageId  }] }        } : {}),
      } as never,
    } as never);

    const notionPageId = (page as any).id ?? null;
    await supabase.from("bank_transactions")
      .update({ category, confirmed_at: new Date().toISOString(), notion_page_id: notionPageId })
      .eq("user_id", userId).eq("id", input.id);

    return { ok: true, notion_page_id: notionPageId };
  } catch (err: any) {
    // Surface the actual reason (Notion 401, schema mismatch, env missing)
    // so the client can show it instead of a useless "Server error".
    const msg = err?.body?.message ?? err?.message ?? "Notion write failed";
    console.error("bank tx confirm failed:", msg);
    return { ok: false, error: String(msg).slice(0, 240) };
  }
}
