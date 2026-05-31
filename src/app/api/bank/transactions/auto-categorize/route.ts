// Alfred auto-categorize: bulk-classify the unreviewed inbox using OpenAI,
// auto-confirm everything Alfred is HIGH-confidence on (Notion ledger write),
// and leave LOW-confidence rows in the inbox with a suggested category + a
// confidence flag so Aaron can finish them in seconds.
//
// Vault-gated. Same write path as manual confirms (lib/bank/confirmTransaction).
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { confirmTransaction } from "@/lib/bank/confirmTransaction";
import { config } from "@/config";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LEDGER_CATS = [
  "Client", "UGC Payout", "Other Income", "Interest", "refund",
  "Food", "Fun", "Transit", "Other Personal", "Personal Drawing",
  "Props", "Gear", "Software", "Subscriptions", "Other",
  "Bank Move", "Pot Move", "Investments", "Donation", "reimbursed", "adjustment",
] as const;

type LLMRow = {
  id: string;
  category: typeof LEDGER_CATS[number];
  transactionType: "Expense" | "Income" | "Transfer" | "Tax Payment";
  businessPct: number;        // 0..100, 0 unless clearly business
  confidence: "high" | "low";
  reason: string;
};

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (err: any) {
    // Always return JSON — otherwise Vercel hands the client an HTML error
    // page and the fetch JSON.parse blows up with "Unexpected token 'A'…".
    console.error("auto-categorize crashed:", err?.message, err?.stack);
    return NextResponse.json(
      { ok: false, error: `Alfred crashed: ${err?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
}

async function handle(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({} as any));
  const dryRun = body?.dryRun === true;
  // Process one chunk per request so we never exceed Vercel's 60s function
  // timeout on a 100-item inbox. Client loops until processed === 0.
  const chunkSize = Math.max(1, Math.min(40, Number(body?.chunkSize ?? 20)));

  // Pull just one chunk of rows Alfred hasn't reviewed yet. Excluding
  // alfred_reviewed_at IS NOT NULL is what makes the loop terminate —
  // low-confidence rows stay in the inbox but won't be re-classified
  // forever on every sweep.
  const { data: rows } = await supabase
    .from("bank_transactions")
    .select("id, date, description, merchant_name, amount, currency, suggested_category, account_id")
    .eq("user_id", user.id)
    .is("confirmed_at", null)
    .is("alfred_reviewed_at", null)
    .order("date", { ascending: false })
    .limit(chunkSize);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, autoConfirmed: 0, flagged: 0, remaining: 0 });
  }

  // Load the bank-account → Notion-account-page mapping ONCE so we can
  // wire ledger entries to the right Notion Accounts page. Without these
  // relations, the Accounts DB rollups (Income In via "To Account",
  // Expense Out via "From Account", Transfer In/Out) never pick up the
  // entry → account balances drift.
  const { data: mapRows } = await supabase
    .from("plaid_notion_account_map")
    .select("plaid_account_id, notion_page_id")
    .eq("user_id", user.id);
  const accountMap = new Map<string, string>(
    (mapRows ?? []).map(m => [m.plaid_account_id, m.notion_page_id])
  );

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set on the server" }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Single batch per request — chunkSize already capped above.
  const batches: typeof rows[] = [rows];

  const classified: LLMRow[] = [];

  for (const batch of batches) {
    const prompt = `You are Alfred, ${config.owner.name}'s financial assistant. Categorize each bank transaction into one of these EXACT Notion Ledger categories:
${LEDGER_CATS.join(", ")}

Rules:
- "Client" = filmmaking client payment (deposit/transfer in, large amount, business name in description)
- "UGC Payout" = TikTok creator fund, brand deal payout, sponsorship deposit
- "Other Income" = catch-all for unclear income (positive amounts you can't otherwise classify)
- "Interest" = bank interest paid to him
- "refund" / "reimbursed" / "adjustment" = bank corrections, returns
- "Food" = groceries + restaurants + delivery
- "Fun" = entertainment, alcohol, hobbies (non-food, non-work)
- "Transit" = Uber/Lyft/gas/TTC/Presto
- "Personal Drawing" = transfers TO his personal use (cash withdrawals, personal e-transfers from biz)
- "Other Personal" = miscellaneous personal expense
- "Props" = filmmaking props / set dressing / costumes (business)
- "Gear" = camera/lens/lighting/audio gear (business, often big-ticket Amazon/B&H/Adorama)
- "Software" = SaaS he uses for work (OpenAI, Anthropic, Adobe, Notion, Figma, Vercel, Supabase, GitHub, Cursor)
- "Subscriptions" = personal subs (Spotify, Netflix, iCloud, Apple Music)
- "Other" = unknown / can't tell
- "Bank Move" = internal transfer between his own accounts (most ambiguous transfers default here)
- "Pot Move" = transfer into a savings pot
- "Investments" = Wealthsimple, brokerage funding, TFSA/RRSP deposit
- "Donation" = charity / GoFundMe / fundraiser

transactionType: "Expense" (negative amount, money out), "Income" (positive, earned), "Transfer" (internal between his accounts), "Tax Payment" (CRA, GST, HST payments).

businessPct: 0 by default. Set to 100 ONLY for clearly business expenses (Software, Gear, Props, Client work, business subscriptions). Mixed-use? 50.

confidence:
- "high" = you are confident enough that this can be auto-written to the Notion Ledger without manual review. Common merchants (Loblaws, Tim Hortons, Spotify, Wealthsimple, Amazon for gear, etiology obvious from description) = high.
- "low" = unclear, ambiguous merchant, transfer of uncertain destination, unfamiliar name, OR the amount is over $500 (always flag big-ticket items for human review).

Return ONLY a JSON object: { "rows": [ { "id": "...", "category": "...", "transactionType": "...", "businessPct": 0, "confidence": "high|low", "reason": "1 short clause" }, ... ] }

Transactions:
${batch.map(r => `- id=${r.id} | ${r.date} | "${r.merchant_name ?? r.description ?? "Unknown"}" | ${r.amount} ${r.currency}`).join("\n")}`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      const txt = completion.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(txt);
      const arr: LLMRow[] = Array.isArray(parsed?.rows) ? parsed.rows : [];
      for (const r of arr) {
        if (!r?.id) continue;
        if (!LEDGER_CATS.includes(r.category as any)) r.category = "Other" as any;
        if (!["Expense", "Income", "Transfer", "Tax Payment"].includes(r.transactionType)) r.transactionType = "Expense";
        r.confidence = r.confidence === "high" ? "high" : "low";
        r.businessPct = Math.max(0, Math.min(100, Number(r.businessPct ?? 0)));
        classified.push(r);
      }
    } catch (err: any) {
      console.error("Alfred batch classify failed:", err?.message);
      // Skip this batch — leave those rows untouched, Aaron can rerun.
    }
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, classified });
  }

  // Build a quick lookup so we can resolve each classified row back to
  // its source bank_account_id (needed to wire From/To Account relations).
  const txByIdx = new Map<string, typeof rows[number]>(rows.map(r => [r.id, r]));

  // Apply: HIGH → confirmTransaction (writes to Notion). LOW → update suggested_category + flag.
  let autoConfirmed = 0;
  let flagged = 0;
  const errors: string[] = [];

  const nowIso = new Date().toISOString();
  for (const r of classified) {
    // Resolve the Notion Accounts-DB page for this transaction's bank
    // account. The mapping is keyed by bank_accounts.id (legacy column
    // name "plaid_account_id").
    const sourceTx = txByIdx.get(r.id);
    const notionAccountPage = sourceTx?.account_id ? accountMap.get(sourceTx.account_id) ?? null : null;

    // Transfers move money between TWO of Aaron's accounts. Alfred has no
    // way to know the destination from a single CSV row, so we never
    // auto-confirm transfers — always flag them for human pick of To Account.
    // (Without a To Account the Transfer In rollup would never fire and the
    // receiving account's balance stays wrong.)
    const isUnsafeForAutoConfirm =
      r.transactionType === "Transfer" || !notionAccountPage;

    if (r.confidence === "high" && !isUnsafeForAutoConfirm) {
      // Route the resolved account page to the correct Notion relation:
      //   Expense / Tax Payment → "From Account" (money leaves this account)
      //   Income                → "To Account"   (money lands in this account)
      // (Transfer is excluded above — Aaron must confirm manually.)
      const isInflow = r.transactionType === "Income";
      const res = await confirmTransaction(supabase, user.id, {
        id: r.id,
        category: r.category,
        transactionType: r.transactionType,
        businessPct: r.businessPct,
        notes: `Alfred auto-categorized: ${r.reason ?? ""}`.slice(0, 600),
        fromAccountPageId: isInflow ? null : notionAccountPage,
        toAccountPageId:   isInflow ? notionAccountPage : null,
      });
      if (res.ok) {
        autoConfirmed++;
        // Mark Alfred-reviewed even on the high path so re-sweeps skip it
        // (confirmed_at would do the same but we want the audit trail).
        await supabase.from("bank_transactions")
          .update({ alfred_reviewed_at: nowIso, alfred_confidence: "high" })
          .eq("user_id", user.id).eq("id", r.id);
      } else {
        errors.push(`${r.id}: ${res.error}`);
        // Don't mark reviewed — Notion write failed, leave it for retry.
      }
    } else {
      // Low confidence, OR a Transfer, OR no account mapping exists yet —
      // any of these mean Aaron should review manually.
      const { error } = await supabase
        .from("bank_transactions")
        .update({
          suggested_category: r.category,
          alfred_reviewed_at: nowIso,
          alfred_confidence: "low",
        })
        .eq("user_id", user.id).eq("id", r.id);
      if (!error) flagged++;
    }
  }

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "alfred_auto_categorize",
    metadata: { processed: classified.length, autoConfirmed, flagged, errors: errors.slice(0, 5) },
  }).then(() => {}, () => {});

  // How many rows are still untouched by Alfred? This is what drives the
  // client loop — once 0, we stop. (Excludes already-classified low-conf
  // rows so the loop terminates even when Alfred can't auto-confirm.)
  const { count: remaining } = await supabase
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("confirmed_at", null)
    .is("alfred_reviewed_at", null);

  return NextResponse.json({
    ok: true,
    processed: classified.length,
    autoConfirmed,
    flagged,
    remaining: remaining ?? 0,
    errors: errors.length ? errors.slice(0, 5) : undefined,
  });
}
