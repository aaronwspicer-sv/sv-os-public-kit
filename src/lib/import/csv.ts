// Bank CSV parsers. Handles RBC + TD format quirks.
// Designed so adding a new bank = one new parser function in this file.

export interface ImportedTx {
  date:         string;        // YYYY-MM-DD
  description:  string;
  amount:       number;        // signed: negative = spend, positive = income
  currency:     string;        // 'CAD' or 'USD'
  rawAccount?:  string;        // bank's account identifier (for grouping)
  rawType?:     string;
}

export interface ImportResult {
  bank: "rbc" | "td" | "unknown";
  count: number;
  transactions: ImportedTx[];
  warnings: string[];
  /** Latest balance per raw-account label, when the bank's CSV includes it.
   *  TD does (column 5). RBC doesn't — those accounts need manual entry. */
  latestBalances: Record<string, number>;
}

// ── Tiny CSV parser (handles quoted commas inside fields) ──
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else {
      if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function normalizeDate(s: string): string | null {
  if (!s) return null;
  // MM/DD/YYYY or M/D/YYYY (RBC + TD common)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const [, mo, da, y] = us;
    return `${y}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY (less common but try if US-style fails)
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (dmy) {
    const [, da, mo, y] = dmy;
    return `${y}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(s: string): number | null {
  if (s == null) return null;
  const cleaned = String(s).replace(/[$,]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── RBC ──
// Header: Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$
function parseRbc(lines: string[]): ImportedTx[] {
  const out: ImportedTx[] = [];
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (row.length < 7) continue;
    const [accType, accNum, dateRaw, , desc1, desc2, cad, usd] = row;
    const date = normalizeDate(dateRaw);
    if (!date) continue;
    const description = [desc1, desc2].filter(Boolean).join(" ").trim();
    const cadAmt = parseAmount(cad);
    const usdAmt = parseAmount(usd);
    if (cadAmt && cadAmt !== 0) {
      out.push({ date, description, amount: cadAmt, currency: "CAD", rawAccount: `${accType} ${accNum}`.trim(), rawType: accType });
    } else if (usdAmt && usdAmt !== 0) {
      out.push({ date, description, amount: usdAmt, currency: "USD", rawAccount: `${accType} ${accNum}`.trim(), rawType: accType });
    }
  }
  return out;
}

// ── TD ──
// TD's CSV has no header. Format: DATE,DESCRIPTION,DEBIT,CREDIT,BALANCE
function parseTd(lines: string[]): { txs: ImportedTx[]; latestBalance: number | null } {
  const out: ImportedTx[] = [];
  // TD lists newest-first. The first row with a numeric balance is the
  // most-recent balance for the account. (Some users have older-first; we
  // handle both by sorting at the end.)
  let firstBalance: number | null = null;
  let latestDate = "";
  let latestBalanceForLatest = null as number | null;
  for (const line of lines) {
    const row = parseCsvLine(line);
    if (row.length < 4) continue;
    const [dateRaw, description, debitRaw, creditRaw, balanceRaw] = row;
    const date = normalizeDate(dateRaw);
    if (!date) continue;
    const debit  = parseAmount(debitRaw)  ?? 0;
    const credit = parseAmount(creditRaw) ?? 0;
    const balance = parseAmount(balanceRaw);
    if (firstBalance === null && balance !== null) firstBalance = balance;
    // Track balance corresponding to the most-recent date in the file
    if (balance !== null && date >= latestDate) {
      latestDate = date;
      latestBalanceForLatest = balance;
    }
    let amount = 0;
    if (debit  > 0) amount = -debit;
    if (credit > 0) amount =  credit;
    if (amount === 0) continue;
    out.push({ date, description: description.trim(), amount, currency: "CAD" });
  }
  // Prefer the balance that pairs with the actual latest date in the file
  const latestBalance = latestBalanceForLatest ?? firstBalance;
  return { txs: out, latestBalance };
}

// ── Detect bank from file content ──
function detectBank(text: string, filename?: string): "rbc" | "td" | "unknown" {
  const lower = (filename ?? "").toLowerCase();
  if (lower.includes("rbc"))              return "rbc";
  if (lower.includes("td") || lower.includes("tdcanada")) return "td";
  // Content heuristics
  const head = text.slice(0, 500).toLowerCase();
  if (head.includes("account type,account number,transaction date")) return "rbc";
  // TD: numeric date in first column, no header
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  if (/^\d{1,2}\/\d{1,2}\/\d{4},/.test(firstLine)) return "td";
  return "unknown";
}

export function parseCsv(text: string, filename?: string): ImportResult {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { bank: "unknown", count: 0, transactions: [], warnings: ["Empty file"], latestBalances: {} };

  const bank = detectBank(text, filename);
  let txs: ImportedTx[] = [];
  const latestBalances: Record<string, number> = {};
  const warnings: string[] = [];

  if (bank === "rbc") {
    txs = parseRbc(lines);
    // RBC doesn't emit running balance — caller will need manual entry
  } else if (bank === "td") {
    const { txs: tdTxs, latestBalance } = parseTd(lines);
    txs = tdTxs;
    if (latestBalance !== null) latestBalances["default"] = latestBalance;
  } else {
    warnings.push("Couldn't detect bank format. Supported: RBC, TD. Rename file with 'rbc' or 'td' in the name and try again, or paste your CSV here for me to add support.");
  }

  return { bank, count: txs.length, transactions: txs, warnings, latestBalances };
}

/** Stable per-tx hash for dedup. Same row uploaded twice = same hash = upsert no-op. */
export function txHash(t: ImportedTx, bank: string): string {
  const desc = t.description.toLowerCase().replace(/\s+/g, " ").trim();
  return `${bank}|${t.date}|${t.amount.toFixed(2)}|${desc}`.slice(0, 200);
}
