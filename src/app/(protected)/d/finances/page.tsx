"use client";
import { useState, useEffect, useCallback } from "react";
import { BankConnect } from "@/components/finance/BankConnect";
import { FinanceVaultGate } from "@/components/security/FinanceVaultGate";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { StationHeader } from "@/components/ui/StationHeader";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatMoney } from "@/lib/money";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { NetWorthChart } from "@/components/finance/NetWorthChart";
import { LifeSimCard } from "@/components/finance/LifeSimCard";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle,
  Plus, Link as LinkIcon, RefreshCw, Trash2, X, Unlink,
  ChevronDown, ChevronUp, Wallet, Inbox, Check, Link2
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────
// Shape matches /api/bank/accounts payload (CSV-imported bank accounts).
interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  /** SaltEdge legacy field — unused for CSV but kept so old code paths don't break. */
  subtype?: string;
  /** Maps to bank_accounts.category enum: 'checking' | 'savings' | 'credit_card' | 'loan' | 'investment' */
  category?: string;
  balance: number;
  balanceCurrent?: number;   // legacy alias
  currency: string;
  isoCurrency?: string;      // legacy alias
  institution: string;
}
interface Subscription  { id: string; name: string; monthlyCad: number; amount: number; frequency: string; nextDate: string | null; category: string; isActive: boolean; }
interface IncomeStream  { id: string; name: string; monthlyCad: number; frequency: string; nextDate: string | null; }
interface ManualAsset   { id: string; category: string; name: string; amount_cad: number; }
interface WishlistItem  { id: string; name: string; amount_cad: number; }
interface PlaidTx       { plaid_transaction_id: string; merchant_name: string; amount: number; date: string; suggested_category: string; account_id?: string; }
interface NotionAccount { id: string; notionPageId: string; name: string; type: string; currency: string; currentBalance: number; projectedBalance: number; pendingDelta: number; }
interface LedgerEntry   { id: string; name: string; amount: number; transactionType: string; category: string; status: string; date: string; fromAccountId: string | null; toAccountId: string | null; businessUsePct: number; currency: string; notes: string; }
interface TxForm        { transactionType: string; fromAccountPageId: string; toAccountPageId: string; category: string; businessPct: number; notes: string; }

const ASSET_CATS = [
  { key: "crypto",       label: "Crypto",       emoji: "🪙" },
  { key: "stocks",       label: "Stocks / ETFs", emoji: "📈" },
  { key: "real_estate",  label: "Real Estate",   emoji: "🏠" },
  { key: "vehicle",      label: "Vehicle",        emoji: "🚗" },
  { key: "other",        label: "Other",          emoji: "💼" },
] as const;

const LEDGER_CATS = [
  "Client","UGC Payout","Other Income","Interest","refund",
  "Food","Fun","Transit","Other Personal","Personal Drawing",
  "Props","Gear","Software","Subscriptions","Other",
  "Bank Move","Pot Move","Investments","Donation","reimbursed","adjustment"
] as const;

const TX_TYPES = ["Expense", "Income", "Transfer", "Tax Payment"] as const;

const CAT_COLORS: Record<string, string> = {
  Client: "#34d399", "UGC Payout": "#34d399", "Other Income": "#34d399",
  Interest: "#34d399", refund: "#34d399", reimbursed: "#34d399",
  Food: "#60a5fa", Fun: "#a78bfa", Transit: "#60a5fa",
  "Other Personal": "#94a3b8", "Personal Drawing": "#94a3b8",
  Props: "#f87171", Gear: "#f87171", Software: "#f87171",
  Subscriptions: "#f87171", Other: "#f87171",
  "Bank Move": "#fbbf24", "Pot Move": "#fbbf24",
  Investments: "#c084fc", Donation: "#f472b6",
  adjustment: "#94a3b8",
  "Tax Payment": "#fb923c",
};

function fmt(n: number) {
  // Currency symbol follows config (CAD→"$", EUR→"€", …); abs preserves
  // prior unsigned display.
  return formatMoney(Math.abs(n), { decimals: 2 });
}
function fmtSigned(n: number) {
  return formatMoney(n, { decimals: 2, signed: true });
}
function freqLabel(f: string) {
  const m: Record<string,string> = { WEEKLY:"Weekly", BIWEEKLY:"Bi-weekly", SEMI_MONTHLY:"Twice/mo", MONTHLY:"Monthly", ANNUALLY:"Yearly", UNKNOWN:"Variable" };
  return m[f] ?? f;
}
function pctClass(pct: number) {
  if (pct < 5)  return "text-success";
  if (pct < 25) return "text-warning";
  return "text-danger";
}
function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0,0,0,0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000*60*60*24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-CA", { weekday: "long" });
  return d.toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

// ── Bank "connect" (CSV upload — provider-free, self-hosted) ──
// BankConnect calls onUploadComplete after a successful import. We forward
// it to onSuccess so FinancesOnboarding flips to the dashboard automatically.
function PlaidConnectButton({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div className="w-full">
      <BankConnect className="w-full" onUploadComplete={onSuccess} />
    </div>
  );
}

// ── Onboarding screen ────────────────────────────────────────────
function FinancesOnboarding({ onSuccess }: { onSuccess: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 px-4 animate-fade-up">
      <div className="w-20 h-20 rounded-[28px] bg-accent-dim border border-[rgba(29,155,240,0.2)] flex items-center justify-center">
        <DollarSign size={36} className="text-accent" />
      </div>
      <div className="text-center flex flex-col gap-2 max-w-[280px]">
        <h2 className="text-[22px] font-700 tracking-tight text-text-1">Connect your bank</h2>
        <p className="text-[13px] text-text-3 leading-relaxed">
          Link your accounts to track net worth, auto-detect subscriptions, and review transactions — all in one place.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[280px]">
        {[
          { icon: "💰", label: "Net worth at a glance" },
          { icon: "🔁", label: "Auto-detected subscriptions" },
          { icon: "📥", label: "Transaction inbox → Notion ledger" },
        ].map(f => (
          <div key={f.label} className="flex items-center gap-3 px-4 py-3 rounded-[12px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
            <span className="text-[18px]">{f.icon}</span>
            <span className="text-[13px] font-500 text-text-2">{f.label}</span>
          </div>
        ))}
      </div>
      <div className="w-full max-w-[280px]">
        <PlaidConnectButton onSuccess={onSuccess} />
      </div>
      <p className="text-[11px] text-text-3 text-center max-w-[240px]">
        Secured by Plaid. Your credentials are never stored — only an encrypted access token.
      </p>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────
export default function FinancesPage() {
  const { isDemoMode } = useDemoMode();
  const [tab, setTab] = useState<"overview"|"transactions"|"wealth"|"tax">("overview");

  // Plaid data
  const [accounts, setAccounts]   = useState<PlaidAccount[]>([]);
  const [plaidTotal, setPlaidTotal] = useState(0);
  const [subs, setSubs]           = useState<Subscription[]>([]);
  const [income, setIncome]       = useState<IncomeStream[]>([]);
  const [monthlyBurn, setMonthlyBurn]     = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [inbox, setInbox]         = useState<PlaidTx[]>([]);
  const [isLinked, setIsLinked]   = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Notion data
  const [notionAccounts, setNotionAccounts] = useState<NotionAccount[]>([]);
  const [notionAccountsError, setNotionAccountsError] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries]   = useState<LedgerEntry[]>([]);

  // Manual data
  const [manualAssets, setManualAssets] = useState<ManualAsset[]>([]);
  const [wishlist, setWishlist]         = useState<WishlistItem[]>([]);

  // Loading states
  const [loadingPlaidAccounts, setLoadingPlaidAccounts] = useState(false);
  const [loadingNotionAccounts, setLoadingNotionAccounts] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingSubs, setLoadingSubs]     = useState(false);
  const [loadingInbox, setLoadingInbox]   = useState(false);
  const [syncing, setSyncing]             = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Add forms
  const [assetForm, setAssetForm] = useState({ category: "crypto", name: "", amount: "" });
  const [wishForm, setWishForm]   = useState({ name: "", amount: "" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [txForms, setTxForms] = useState<Record<string, TxForm>>({});

  // Plaid account ID → Notion page ID mapping (from /api/account-map)
  const [accountMap, setAccountMap] = useState<Record<string, string>>({});
  const [mappingPlaidId, setMappingPlaidId] = useState<string | null>(null); // which Plaid acct row has the link dropdown open
  const [mappingSaving, setMappingSaving] = useState(false);

  // ── Demo mode: inject fake data so all UI is demonstrable ────
  const now2 = new Date();
  const thisMonth = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,"0")}`;
  useEffect(() => {
    if (!isDemoMode) { fetchAll(); return; }
    setIsLinked(true);
    setInitialLoadDone(true);
    setAccounts([
      { id: "d1", name: "Main Chequing", type: "depository", category: "checking", balance: 8432.17, currency: "CAD", institution: "TD Bank" },
      { id: "d2", name: "High-Interest Savings", type: "depository", category: "savings", balance: 22400.00, currency: "CAD", institution: "EQ Bank" },
      { id: "d3", name: "Visa Credit Card", type: "credit", category: "credit_card", balance: -1240.55, currency: "CAD", institution: "TD Bank" },
    ]);
    setPlaidTotal(29591.62);
    setNotionAccounts([
      { id: "n1", notionPageId: "n1", name: "Main Chequing", type: "Bank", currency: "CAD", currentBalance: 8432.17, projectedBalance: 8432.17, pendingDelta: 0 },
      { id: "n2", notionPageId: "n2", name: "High-Interest Savings", type: "Bank", currency: "CAD", currentBalance: 22400.00, projectedBalance: 22400.00, pendingDelta: 0 },
      { id: "n3", notionPageId: "n3", name: "TFSA Index Funds", type: "Other", currency: "CAD", currentBalance: 12000.00, projectedBalance: 12000.00, pendingDelta: 0 },
    ]);
    setManualAssets([
      { id: "m1", category: "crypto",  name: "Bitcoin",      amount_cad: 3200 },
      { id: "m2", category: "stocks",  name: "Index Funds",  amount_cad: 9000 },
      { id: "m3", category: "vehicle", name: "Vehicle",      amount_cad: 12000 },
    ]);
    setWishlist([
      { id: "w1", name: "Sony A7C II",   amount_cad: 3200 },
      { id: "w2", name: "Studio Desk",   amount_cad: 850 },
      { id: "w3", name: "DJI Mic 2",     amount_cad: 380 },
    ]);
    setSubs([
      { id: "s1", name: "Adobe Creative Cloud", monthlyCad: 89.99, amount: 89.99, frequency: "MONTHLY", nextDate: `${thisMonth}-15`, category: "Software", isActive: true },
      { id: "s2", name: "Netflix",               monthlyCad: 20.99, amount: 20.99, frequency: "MONTHLY", nextDate: `${thisMonth}-22`, category: "Subscriptions", isActive: true },
      { id: "s3", name: "Spotify",               monthlyCad: 12.99, amount: 12.99, frequency: "MONTHLY", nextDate: `${thisMonth}-08`, category: "Subscriptions", isActive: true },
      { id: "s4", name: "YouTube Premium",       monthlyCad: 18.99, amount: 18.99, frequency: "MONTHLY", nextDate: `${thisMonth}-01`, category: "Subscriptions", isActive: true },
    ]);
    setIncome([
      { id: "i1", name: "YouTube AdSense",  monthlyCad: 2400, frequency: "MONTHLY", nextDate: `${thisMonth}-21` },
      { id: "i2", name: "Brand Deals",      monthlyCad: 1200, frequency: "MONTHLY", nextDate: null },
      { id: "i3", name: "UGC Contracts",    monthlyCad: 800,  frequency: "MONTHLY", nextDate: null },
    ]);
    setMonthlyBurn(142.96);
    setMonthlyIncome(4400);
    setInbox([
      { plaid_transaction_id: "t1", merchant_name: "Costco Wholesale",   amount: 247.83, date: `${thisMonth}-28`, suggested_category: "Food",          account_id: "d1" },
      { plaid_transaction_id: "t2", merchant_name: "Shell Gas Station",   amount: 78.40,  date: `${thisMonth}-27`, suggested_category: "Transit",       account_id: "d1" },
      { plaid_transaction_id: "t3", merchant_name: "Amazon.ca",           amount: 134.99, date: `${thisMonth}-26`, suggested_category: "Other Personal", account_id: "d3" },
    ]);
    setLedgerEntries([
      { id: "le1", name: "YouTube AdSense",    amount: 2400, transactionType: "Income",  category: "UGC Payout",     status: "cleared", date: `${thisMonth}-21`, fromAccountId: null, toAccountId: "n1", businessUsePct: 0, currency: "CAD", notes: "" },
      { id: "le2", name: "Brand Deal",         amount: 1200, transactionType: "Income",  category: "Client",         status: "cleared", date: `${thisMonth}-15`, fromAccountId: null, toAccountId: "n1", businessUsePct: 0, currency: "CAD", notes: "" },
      { id: "le3", name: "Grocery Run",        amount: 247,  transactionType: "Expense", category: "Food",           status: "cleared", date: `${thisMonth}-28`, fromAccountId: "n1", toAccountId: null, businessUsePct: 0, currency: "CAD", notes: "" },
      { id: "le4", name: "Adobe CC",           amount: 90,   transactionType: "Expense", category: "Software",       status: "cleared", date: `${thisMonth}-14`, fromAccountId: "n1", toAccountId: null, businessUsePct: 100, currency: "CAD", notes: "" },
      { id: "le5", name: "Gas Fill-up",        amount: 78,   transactionType: "Expense", category: "Transit",        status: "cleared", date: `${thisMonth}-27`, fromAccountId: "n1", toAccountId: null, businessUsePct: 0, currency: "CAD", notes: "" },
      { id: "le6", name: "Coffee & Meetings",  amount: 64,   transactionType: "Expense", category: "Food",           status: "cleared", date: `${thisMonth}-20`, fromAccountId: "n1", toAccountId: null, businessUsePct: 0, currency: "CAD", notes: "" },
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  const manualTotal = manualAssets.reduce((s, a) => s + Number(a.amount_cad), 0);

  // Plaid is the live source of truth for Banks.
  // Pots are intentionally excluded — they double-count savings that already
  // appear in a Bank account (e.g. the "RBC SAVINGS" pot mirrors the RBC
  // savings CSV account). Re-introduce only when pots represent money that
  // isn't already in a linked bank account.
  // If Plaid isn't connected yet, fall back to Notion Bank balances so net worth still renders.
  const notionBanksTotal = notionAccounts.filter(a => a.type === "Bank").reduce((s, a) => s + Number(a.currentBalance), 0);
  const notionOtherTotal = notionAccounts.filter(a => a.type !== "Bank" && a.type !== "Pot").reduce((s, a) => s + Number(a.currentBalance), 0);
  const banksTotal = isLinked ? plaidTotal : notionBanksTotal;
  const netWorth   = banksTotal + notionOtherTotal + manualTotal;
  const wishTotal  = wishlist.reduce((s, w) => s + Number(w.amount_cad), 0);

  // This month income/spend from Ledger
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
  const monthEntries = ledgerEntries.filter(e => e.date >= monthStart);
  const monthIncome  = monthEntries.filter(e => e.transactionType === "Income").reduce((s,e) => s + Number(e.amount), 0);
  const monthExpense = monthEntries.filter(e => e.transactionType === "Expense" || e.transactionType === "Tax Payment").reduce((s,e) => s + Number(e.amount), 0);

  async function fetchAll(isInitial = false) {
    setSyncing(true);
    await Promise.all([
      fetchAccounts(),
      fetchSubs(),
      fetchInbox(),
      fetchManual(),
      fetchWishlist(),
      fetchNotionAccounts(),
      fetchLedger(),
      fetchAccountMap(),
    ]);
    setSyncing(false);
    if (isInitial) setInitialLoadDone(true);
  }

  async function fetchAccounts() {
    setLoadingPlaidAccounts(true);
    try {
      // Force fresh — Next 15 + browser will otherwise cache the GET and we'll
      // never notice a freshly-imported CSV.
      const r = await fetch("/api/bank/accounts", { cache: "no-store" });
      const d = await r.json();
      // Belt + suspenders: flip "linked" when either hasItems is true OR we
      // got accounts back (handles edge cases where the boolean is missing).
      if (typeof d.hasItems === "boolean") setIsLinked(d.hasItems);
      if (Array.isArray(d.accounts)) {
        setAccounts(d.accounts);
        setPlaidTotal(d.totalCad ?? 0);
        if (d.accounts.length > 0) setIsLinked(true);
      }
    } catch {}
    setLoadingPlaidAccounts(false);
  }

  async function fetchNotionAccounts() {
    setLoadingNotionAccounts(true);
    setNotionAccountsError(null);
    try {
      const r = await fetch("/api/notion/accounts", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setNotionAccountsError(d?.error ?? `HTTP ${r.status}`);
      } else if (Array.isArray(d.accounts)) {
        setNotionAccounts(d.accounts);
        if (d.accounts.length === 0) setNotionAccountsError("No accounts returned from Notion");
      } else {
        setNotionAccountsError("Unexpected response shape");
      }
    } catch (e: any) {
      setNotionAccountsError(e?.message ?? "Network error");
    }
    setLoadingNotionAccounts(false);
  }

  async function fetchLedger() {
    setLoadingLedger(true);
    try {
      const r = await fetch("/api/notion/ledger");
      const d = await r.json();
      if (d.entries) setLedgerEntries(d.entries);
    } catch {}
    setLoadingLedger(false);
  }

  async function fetchSubs() {
    setLoadingSubs(true);
    try {
      const r = await fetch("/api/bank/recurring");
      const d = await r.json();
      if (d.subscriptions) { setSubs(d.subscriptions); setIncome(d.income); setMonthlyBurn(d.monthlyBurn); setMonthlyIncome(d.monthlyIncome); }
    } catch {}
    setLoadingSubs(false);
  }

  async function fetchInbox() {
    setLoadingInbox(true);
    try {
      // ?unreviewed=1 makes the server filter to confirmed_at IS NULL, so we
      // don't have to trust a client-side boolean that the API never sets.
      // limit=500 is the API max — needed because the inbox can grow past
      // the default 100 after a few CSV imports.
      const r = await fetch("/api/bank/transactions?unreviewed=1&limit=500");
      const d = await r.json();
      if (d.transactions) { setInbox(d.transactions.filter((t: any) => !t.confirmed_at)); }
    } catch {}
    setLoadingInbox(false);
  }

  // Alfred auto-categorize: bulk-classify the inbox, auto-write HIGH
  // confidence to Notion, leave LOW confidence in the inbox flagged.
  const [autoCatLoading, setAutoCatLoading] = useState(false);
  const [autoCatProgress, setAutoCatProgress] = useState<{ processed: number; remaining: number } | null>(null);
  const [autoCatResult, setAutoCatResult]   = useState<{ autoConfirmed: number; flagged: number; processed: number; errors?: string[] } | null>(null);
  async function runAlfredAutoCategorize() {
    if (autoCatLoading) return;
    setAutoCatLoading(true);
    setAutoCatResult(null);
    setAutoCatProgress(null);
    // Loop one chunk per request so a 100-row inbox can't hit Vercel's 60s
    // function timeout. Server returns `remaining`; we stop when it hits 0
    // OR when a chunk processes 0 rows (e.g. OpenAI failed on all of them).
    let totalConfirmed = 0;
    let totalFlagged   = 0;
    let totalProcessed = 0;
    let lastErrors: string[] | undefined;
    try {
      for (let i = 0; i < 50; i++) { // hard cap so we never loop forever (50 × 20 = 1000 row ceiling)
        const r = await fetch("/api/bank/transactions/auto-categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunkSize: 20 }),
        });
        const d = await r.json().catch(() => ({ ok: false, error: "Non-JSON response (likely server timeout)" }));
        if (!d.ok) { alert(`Alfred failed: ${d?.error ?? "Unknown error"}`); break; }
        totalConfirmed += d.autoConfirmed ?? 0;
        totalFlagged   += d.flagged ?? 0;
        totalProcessed += d.processed ?? 0;
        if (d.errors?.length) lastErrors = d.errors;
        setAutoCatProgress({ processed: totalProcessed, remaining: d.remaining ?? 0 });
        // Stop when there's nothing left, or this chunk made no progress
        if ((d.remaining ?? 0) === 0) break;
        if ((d.processed ?? 0) === 0) break;
      }
      setAutoCatResult({
        autoConfirmed: totalConfirmed,
        flagged: totalFlagged,
        processed: totalProcessed,
        errors: lastErrors,
      });
      await Promise.all([fetchInbox(), fetchLedger()]);
    } catch (err: any) {
      alert(`Alfred network error: ${err?.message ?? "Unknown"}`);
    }
    setAutoCatLoading(false);
    setAutoCatProgress(null);
  }

  async function fetchManual() {
    const r = await fetch("/api/manual-assets");
    const d = await r.json();
    if (d.assets) setManualAssets(d.assets);
  }

  async function fetchWishlist() {
    const r = await fetch("/api/wishlist");
    const d = await r.json();
    if (d.items) setWishlist(d.items);
  }

  async function fetchAccountMap() {
    try {
      const r = await fetch("/api/account-map");
      const d = await r.json();
      if (d.mappings) {
        setAccountMap(Object.fromEntries(
          d.mappings.map((m: { plaidAccountId: string; notionPageId: string }) => [m.plaidAccountId, m.notionPageId])
        ));
      }
    } catch {}
  }

  async function saveMapping(plaidAccountId: string, notionPageId: string) {
    setMappingSaving(true);
    try {
      await fetch("/api/account-map", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plaidAccountId, notionPageId }),
      });
      setAccountMap(prev => ({ ...prev, [plaidAccountId]: notionPageId }));
      setMappingPlaidId(null);
    } finally {
      setMappingSaving(false);
    }
  }

  async function deleteMapping(plaidAccountId: string) {
    await fetch("/api/account-map", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plaidAccountId }),
    });
    setAccountMap(prev => {
      const next = { ...prev };
      delete next[plaidAccountId];
      return next;
    });
  }

  useEffect(() => { fetchAll(true); }, []);

  async function addAsset() {
    const { category, name, amount } = assetForm;
    if (!name.trim() || !amount) return;
    const r = await fetch("/api/manual-assets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name: name.trim(), amount_cad: parseFloat(amount) }),
    });
    const d = await r.json();
    if (d.asset) { setManualAssets(prev => [...prev, d.asset]); setAssetForm(f => ({ ...f, name: "", amount: "" })); }
  }

  async function deleteAsset(id: string) {
    setManualAssets(prev => prev.filter(a => a.id !== id));
    await fetch("/api/manual-assets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  async function addWish() {
    const { name, amount } = wishForm;
    if (!name.trim() || !amount) return;
    const r = await fetch("/api/wishlist", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), amount_cad: parseFloat(amount) }),
    });
    const d = await r.json();
    if (d.item) { setWishlist(prev => [...prev, d.item]); setWishForm({ name: "", amount: "" }); }
  }

  async function deleteWish(id: string) {
    setWishlist(prev => prev.filter(w => w.id !== id));
    await fetch("/api/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }

  async function disconnectPlaid() {
    setDisconnecting(true);
    await fetch("/api/bank/accounts", { method: "DELETE" });
    setAccounts([]);
    setPlaidTotal(0);
    setIsLinked(false);
    setSubs([]);
    setIncome([]);
    setInbox([]);
    setMonthlyBurn(0);
    setMonthlyIncome(0);
    setDisconnecting(false);
    setConfirmDisconnect(false);
  }

  function defaultTxForm(tx: PlaidTx): TxForm {
    const mappedNotionId = tx.account_id ? accountMap[tx.account_id] : undefined;
    return {
      transactionType: "Expense",
      fromAccountPageId: mappedNotionId ?? "",
      toAccountPageId: "",
      category: tx.suggested_category ?? "Other Personal",
      businessPct: 0,
      notes: "",
    };
  }
  function updateTxForm(txId: string, patch: Partial<TxForm>, tx: PlaidTx) {
    setTxForms(prev => ({ ...prev, [txId]: { ...defaultTxForm(tx), ...prev[txId], ...patch } }));
  }
  function getTxForm(txId: string, tx: PlaidTx): TxForm {
    return txForms[txId] ?? defaultTxForm(tx);
  }

  async function confirmTx(tx: PlaidTx) {
    const form = getTxForm(tx.plaid_transaction_id, tx);
    setConfirmingId(tx.plaid_transaction_id);
    try {
      // Route the single account picker to the correct Notion relation:
      //   Expense / Tax Payment → "From Account" (account losing money)
      //   Income                → "To Account"   (account receiving money)
      //   Transfer              → "From Account" + the second picker for "To Account"
      // The Notion Accounts rollups depend on this: Income In sums via
      // Ledger To Account; Expense Out / Transfer Out sum via Ledger
      // From Account; Transfer In sums via Ledger To Account.
      const type = form.transactionType || "Expense";
      const isIncome   = type === "Income";
      const isTransfer = type === "Transfer";
      const picked = form.fromAccountPageId || null;
      const fromAccountPageId = isIncome ? null : picked;
      const toAccountPageId   = isIncome
        ? picked
        : isTransfer
          ? (form.toAccountPageId || null)
          : null;

      const r = await fetch("/api/bank/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: tx.plaid_transaction_id,
          category: form.category || tx.suggested_category || "Other Personal",
          fromAccountPageId,
          toAccountPageId,
          transactionType: type,
          businessPct: form.businessPct || 0,
          notes: form.notes || "",
          currency: "CAD",
        }),
      });
      if (r.ok) {
        setInbox(prev => prev.filter(t => t.plaid_transaction_id !== tx.plaid_transaction_id));
        setExpandedTx(null);
        fetchLedger();
      } else {
        // Surface the real reason — Notion 401 / Tax Year fetch / etc.
        const d = await r.json().catch(() => ({}));
        alert(`Confirm failed: ${d?.error ?? r.statusText ?? "Unknown error"}`);
      }
    } finally {
      setConfirmingId(null);
    }
  }

  const tabs = [
    { key: "overview",     label: "Overview",     badge: inbox.length > 0 ? inbox.length : null },
    { key: "transactions", label: "Transactions", badge: null },
    { key: "wealth",       label: "Wealth",       badge: null },
    { key: "tax",          label: "Tax",          badge: null },
  ] as const;

  // Notion account name lookup (for showing "from" in transaction rows)
  const accountNameById = new Map(notionAccounts.map(a => [a.notionPageId, a.name]));

  // Group ledger entries by date
  const ledgerByDate = ledgerEntries.reduce<Record<string, LedgerEntry[]>>((acc, e) => {
    (acc[e.date] ||= []).push(e);
    return acc;
  }, {});
  const ledgerDates = Object.keys(ledgerByDate).sort((a, b) => b.localeCompare(a));

  // ── Donut chart ─────────────────────────────────────────
  function DonutChart() {
    // Banks slice = live Plaid total (or Notion fallback if Plaid not connected)
    const banks      = banksTotal;
    const otherAccts = notionOtherTotal;
    const cryptoAmt  = manualAssets.filter(a => a.category === "crypto").reduce((s,a) => s+Number(a.amount_cad),0);
    const stocksAmt  = manualAssets.filter(a => a.category === "stocks").reduce((s,a) => s+Number(a.amount_cad),0);
    const realEstate = manualAssets.filter(a => a.category === "real_estate").reduce((s,a) => s+Number(a.amount_cad),0);
    const otherAmt   = manualAssets.filter(a => !["crypto","stocks","real_estate"].includes(a.category)).reduce((s,a) => s+Number(a.amount_cad),0);

    const slices = [
      { label: "Banks",       value: banks,      color: "#1D9BF0" },
      { label: "Crypto",      value: cryptoAmt,  color: "#fbbf24" },
      { label: "Stocks",      value: stocksAmt,  color: "#a78bfa" },
      { label: "Real Estate", value: realEstate, color: "#f97316" },
      { label: "Other",       value: otherAcctsPlus(otherAccts, otherAmt), color: "#94a3b8" },
    ].filter(s => s.value > 0);

    const total = slices.reduce((s,x) => s+x.value, 0);
    if (!total) return (
      <div className="flex items-center justify-center h-[140px] text-[12px] text-text-3">
        No data yet
      </div>
    );

    let angle = -Math.PI / 2;
    const cx = 70, cy = 70, ro = 60, ri = 44;
    const paths = slices.map(s => {
      const a = (s.value / total) * Math.PI * 2;
      const a1 = angle, a2 = angle + a - 0.02;
      angle += a;
      const x1 = cx + ro*Math.cos(a1), y1 = cy + ro*Math.sin(a1);
      const x2 = cx + ro*Math.cos(a2), y2 = cy + ro*Math.sin(a2);
      const xi1 = cx + ri*Math.cos(a2), yi1 = cy + ri*Math.sin(a2);
      const xi2 = cx + ri*Math.cos(a1), yi2 = cy + ri*Math.sin(a1);
      const large = a > Math.PI ? 1 : 0;
      return { ...s, d: `M${x1},${y1} A${ro},${ro} 0 ${large},1 ${x2},${y2} L${xi1},${yi1} A${ri},${ri} 0 ${large},0 ${xi2},${yi2} Z` };
    });

    return (
      <div className="flex gap-6 items-center">
        <div className="relative flex-shrink-0">
          <svg width="140" height="140" viewBox="0 0 140 140">
            {paths.map(p => <path key={p.label} d={p.d} fill={p.color} />)}
            <circle cx="70" cy="70" r="44" fill="#000" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[13px] font-700 text-text-1">{fmt(netWorth)}</p>
            <p className="text-[9px] uppercase tracking-widest text-text-3">net worth</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          {paths.map(p => (
            <div key={p.label} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                <span className="text-text-2">{p.label}</span>
              </div>
              <span className="font-700 font-mono tabular-nums text-text-1">{fmt(p.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  function otherAcctsPlus(a: number, b: number) { return a + b; }

  // ── AccountRow ────────────────────────────────────────────────
  function AccountRow({ a }: { a: NotionAccount }) {
    const hasPending = Math.abs(a.pendingDelta) > 0.01;
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.type === "Pot" ? "bg-success" : "bg-accent"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-600 text-text-1 truncate">{a.name}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] text-text-3">{a.type}</p>
            {hasPending && (
              <span className={`text-[10px] font-700 ${a.pendingDelta > 0 ? "text-success" : "text-warning"}`}>
                · {fmtSigned(a.pendingDelta)} pending
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[14px] font-700 tabular-nums font-mono text-text-1">{fmt(a.currentBalance)}</p>
          {hasPending && (
            <p className="text-[10px] text-text-3 tabular-nums font-mono">→ {fmt(a.projectedBalance)}</p>
          )}
        </div>
      </div>
    );
  }

  // ── PlaidBankRow ──────────────────────────────────────────────
  // Renders a live Plaid bank account with mapping UI to link it to a Notion account.
  function PlaidBankRow({ a }: { a: PlaidAccount }) {
    const isCredit = a.category === "credit_card" || a.type === "credit";
    // Tolerate both new (balance/currency) and legacy (balanceCurrent/isoCurrency)
    // shapes so a stale cached response can't render $NaN.
    const balance  = Number(a.balance ?? a.balanceCurrent ?? 0);
    const currency = a.currency ?? a.isoCurrency ?? "CAD";
    const mappedNotionId = accountMap[a.id];
    const mappedNotion = mappedNotionId ? notionAccounts.find(n => n.notionPageId === mappedNotionId) : null;
    const isMapping = mappingPlaidId === a.id;
    // Mapping target: Bank or Other only. Pots are deliberately hidden
    // because they double-count balances already in a linked Bank account.
    const notionBanks = notionAccounts
      .filter(n => n.type === "Bank" || n.type === "Other")
      .sort((x, y) => {
        const rank = (t: string) => t === "Bank" ? 0 : 1;
        if (rank(x.type) !== rank(y.type)) return rank(x.type) - rank(y.type);
        return x.name.localeCompare(y.name);
      });

    return (
      <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isCredit ? "bg-danger" : a.type === "investment" ? "bg-success" : "bg-accent"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-600 text-text-1 truncate">{a.name}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-[11px] text-text-3">{a.institution}{a.subtype ? ` · ${a.subtype}` : ""}</p>
              {mappedNotion && (
                <span className="text-[10px] text-success font-600 flex items-center gap-0.5">
                  · <Link2 size={9} /> {mappedNotion.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-[14px] font-700 tabular-nums font-mono ${isCredit ? "text-danger" : "text-text-1"}`}>
              {isCredit ? "-" : ""}{fmt(balance)}
            </p>
            <p className="text-[10px] text-text-3">{currency}</p>
          </div>
          {mappedNotion ? (
            <button
              onClick={() => deleteMapping(a.id)}
              title="Unlink from Notion"
              className="text-text-3 hover:text-danger transition-colors p-1 flex-shrink-0"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              onClick={() => setMappingPlaidId(isMapping ? null : a.id)}
              className="text-[10px] font-600 text-accent hover:text-text-1 transition-colors px-2 py-1 rounded-[6px] bg-accent-dim flex-shrink-0 flex items-center gap-1"
            >
              <Link2 size={10} /> Link
            </button>
          )}
        </div>
        {isMapping && !mappedNotion && (
          <div className="flex gap-2 pt-2 border-t border-border-dim">
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) saveMapping(a.id, e.target.value); }}
              disabled={mappingSaving}
              className="flex-1 px-3 py-2 text-[12px]"
            >
              <option value="">— Pick a Notion account —</option>
              {notionBanks.map(n => <option key={n.notionPageId} value={n.notionPageId}>{n.name} ({n.type})</option>)}
            </select>
            <Button variant="outline" size="sm" onClick={() => setMappingPlaidId(null)}>Cancel</Button>
          </div>
        )}
      </div>
    );
  }

  // ── Transaction Confirm Form ──────────────────────────────────
  function ConfirmForm({ tx }: { tx: PlaidTx }) {
    const form = getTxForm(tx.plaid_transaction_id, tx);
    const sortedAccts = [...notionAccounts].sort((a,b) => a.name.localeCompare(b.name));
    return (
      <div className="flex flex-col gap-3 pt-3 mt-1 border-t border-border-dim">
        {/* Transaction Type segmented */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">Type</label>
          <div className="grid grid-cols-4 gap-1 p-1 bg-surface-2 rounded-[10px]">
            {TX_TYPES.map(t => (
              <button
                key={t}
                onClick={() => updateTxForm(tx.plaid_transaction_id, { transactionType: t }, tx)}
                className={`py-1.5 rounded-[8px] text-[11px] font-600 transition-all ${
                  form.transactionType === t ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Account picker — label reflects what relation it maps to.
            Income lands IN an account, so the picker is the destination.
            Expense / Tax Payment / Transfer leave FROM an account. */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">
            {form.transactionType === "Income" ? "To Account (received in)" :
             form.transactionType === "Transfer" ? "From Account" :
             "From Account"}
          </label>
          <select
            value={form.fromAccountPageId}
            onChange={e => updateTxForm(tx.plaid_transaction_id, { fromAccountPageId: e.target.value }, tx)}
            className="w-full px-3 py-2 text-[12px]"
          >
            <option value="">— Select account —</option>
            {sortedAccts.map(a => <option key={a.notionPageId} value={a.notionPageId}>{a.name} ({a.type})</option>)}
          </select>
          {sortedAccts.length === 0 && (
            <div className="mt-2 p-2 rounded-[8px] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.24)]">
              <p className="text-[11px] text-danger mb-1.5">
                No Notion accounts loaded{notionAccountsError ? `: ${notionAccountsError}` : ""}.
              </p>
              <Button variant="outline" size="sm" loading={loadingNotionAccounts} onClick={() => fetchNotionAccounts()}>
                <RefreshCw size={11} /> Reload accounts
              </Button>
            </div>
          )}
        </div>

        {/* To Account (only for transfers — Expense uses "From" only, Income re-routes the picker above) */}
        {form.transactionType === "Transfer" && (
          <div>
            <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">To Account</label>
            <select
              value={form.toAccountPageId}
              onChange={e => updateTxForm(tx.plaid_transaction_id, { toAccountPageId: e.target.value }, tx)}
              className="w-full px-3 py-2 text-[12px]"
            >
              <option value="">— Select account —</option>
              {sortedAccts.map(a => <option key={a.notionPageId} value={a.notionPageId}>{a.name} ({a.type})</option>)}
            </select>
          </div>
        )}

        {/* Category */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">Category</label>
          <select
            value={form.category}
            onChange={e => updateTxForm(tx.plaid_transaction_id, { category: e.target.value }, tx)}
            className="w-full px-3 py-2 text-[12px]"
          >
            {LEDGER_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Business % */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">
            Business Use % <span className="text-text-2">{form.businessPct}%</span>
          </label>
          <input
            type="range" min={0} max={100} step={5}
            value={form.businessPct}
            onChange={e => updateTxForm(tx.plaid_transaction_id, { businessPct: parseInt(e.target.value) }, tx)}
            className="w-full"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">Notes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={e => updateTxForm(tx.plaid_transaction_id, { notes: e.target.value }, tx)}
            placeholder="Optional notes…"
            className="w-full px-3 py-2 text-[12px] resize-none"
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          className="w-full"
          loading={confirmingId === tx.plaid_transaction_id}
          onClick={() => confirmTx(tx)}
        >
          <Check size={13} /> Confirm → Notion Ledger
        </Button>
      </div>
    );
  }

  return (
    <FinanceVaultGate label="Finances">
    <div className="flex flex-col gap-6">

      {initialLoadDone && !isLinked && accounts.length === 0 ? (
        <FinancesOnboarding onSuccess={() => { setIsLinked(true); fetchAll(); }} />
      ) : !initialLoadDone ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-[13px] text-text-3 animate-pulse">Loading your finances…</p>
        </div>
      ) : (<>

      <StationHeader
        station="FINANCE"
        title={<span className="tabular-nums">{fmt(netWorth)}</span>}
        sub={`Net worth · ${notionAccounts.length} accounts`}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchAll()} loading={syncing}><RefreshCw size={13} /> Sync</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
              <Unlink size={13} className="text-danger" />
            </Button>
          </div>
        }
      />

      {/* Disconnect modal */}
      {confirmDisconnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-[320px] bg-surface border border-border rounded-[20px] p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[12px] bg-[rgba(248,113,113,0.12)] border border-[rgba(248,113,113,0.2)] flex items-center justify-center flex-shrink-0">
                <Unlink size={18} className="text-danger" />
              </div>
              <div>
                <p className="text-[14px] font-700 text-text-1">Disconnect Bank?</p>
                <p className="text-[11px] text-text-3">Removes all linked accounts + sandbox data</p>
              </div>
            </div>
            <p className="text-[12px] text-text-2 leading-relaxed">
              This wipes all Plaid items and the transaction inbox from the database. Manual assets and wishlist are untouched. Use this to reset before connecting your real accounts.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
              <Button variant="primary" size="sm" className="flex-1 !bg-danger !border-danger" loading={disconnecting} onClick={disconnectPlaid}>
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="animate-fade-up stagger-2 flex gap-1 p-1 bg-surface-2 rounded-[12px]">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-1.5 rounded-[10px] text-[12px] font-600 transition-all relative ${
              tab === t.key ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="ml-1 text-[10px] bg-warning text-black px-1.5 rounded-full font-700">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && (
        <div className="flex flex-col gap-4 animate-fade-up stagger-3">

          {/* This Month strip */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={13} className="text-success" />
                <p className="text-[10px] uppercase tracking-widest text-text-3">Income · This Month</p>
              </div>
              <p className="text-[22px] font-700 tabular-nums text-success font-mono">{fmt(monthIncome)}</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={13} className="text-danger" />
                <p className="text-[10px] uppercase tracking-widest text-text-3">Spent · This Month</p>
              </div>
              <p className="text-[22px] font-700 tabular-nums text-danger font-mono">{fmt(monthExpense)}</p>
            </Card>
          </div>

          {/* Cash flow bar */}
          {(monthIncome > 0 || monthExpense > 0) && (
            <Card>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] uppercase tracking-widest text-text-3">Cash flow</p>
                <p className={`text-[13px] font-700 font-mono tabular-nums ${monthIncome - monthExpense >= 0 ? "text-success" : "text-danger"}`}>
                  {fmtSigned(monthIncome - monthExpense)}
                </p>
              </div>
              <ProgressBar value={monthIncome > 0 ? Math.min(100, (monthExpense / monthIncome) * 100) : 100} color={monthIncome >= monthExpense ? "accent" : "warning"} />
              <p className="text-[10px] text-text-3 mt-1.5">
                Spent {monthIncome > 0 ? `${((monthExpense / monthIncome) * 100).toFixed(0)}%` : "—"} of income
              </p>
            </Card>
          )}

          {/* Inbox alert */}
          {inbox.length > 0 && (
            <button
              onClick={() => setTab("transactions")}
              className="w-full text-left"
            >
              <Card className="flex items-center gap-3" style={{ borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.04)" }}>
                <div className="w-9 h-9 rounded-[12px] bg-[rgba(251,191,36,0.12)] border border-[rgba(251,191,36,0.25)] flex items-center justify-center flex-shrink-0">
                  <Inbox size={16} className="text-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1">{inbox.length} {inbox.length === 1 ? "transaction" : "transactions"} to review</p>
                  <p className="text-[11px] text-text-3">Tap to categorize and sync to Notion</p>
                </div>
                <ChevronDown size={16} className="text-text-3 -rotate-90" />
              </Card>
            </button>
          )}

          {/* Net Worth History Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Net Worth History</CardTitle>
              <Badge variant={netWorth >= 0 ? "success" : "danger"}>{fmt(netWorth)}</Badge>
            </CardHeader>
            <NetWorthChart
              currentNetWorth={isDemoMode ? 47832 : netWorth}
              breakdown={isDemoMode
                ? { banks: 29591, manual: 24200, other: 0 }
                : { banks: banksTotal, manual: manualTotal, other: notionOtherTotal }}
            />
          </Card>

          {/* Donut */}
          <Card>
            <CardHeader>
              <CardTitle>Net Worth Breakdown</CardTitle>
              <Badge variant={netWorth >= 0 ? "success" : "danger"}>{fmt(netWorth)}</Badge>
            </CardHeader>
            <DonutChart />
          </Card>

          {/* Banks — Plaid-driven when linked, Notion fallback when not */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-accent" />
                <CardTitle>Banks</CardTitle>
                {isLinked && <span className="text-[10px] text-success font-700 uppercase tracking-widest">Live</span>}
              </div>
              <Badge variant="muted">{fmt(banksTotal)}</Badge>
            </CardHeader>
            {isLinked ? (
              loadingPlaidAccounts ? (
                <p className="text-[12px] text-text-3 text-center py-3">Loading from Plaid…</p>
              ) : accounts.length === 0 ? (
                <p className="text-[12px] text-text-3 italic text-center py-3">No Plaid accounts loaded — hit Sync</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {accounts.map(a => <PlaidBankRow key={a.id} a={a} />)}
                </div>
              )
            ) : (
              loadingNotionAccounts ? (
                <p className="text-[12px] text-text-3 text-center py-3">Loading…</p>
              ) : notionAccounts.filter(a => a.type === "Bank").length === 0 ? (
                <p className="text-[12px] text-text-3 italic text-center py-3">No bank accounts in Notion yet</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {notionAccounts.filter(a => a.type === "Bank").map(a => <AccountRow key={a.id} a={a} />)}
                </div>
              )
            )}
          </Card>

          {/* Pots section intentionally omitted — they were double-counting
              the savings that already appear in a linked Bank account. */}

          {/* Other Notion accounts — only shown when Plaid isn't connected, otherwise they'd double-count */}
          {!isLinked && notionAccounts.filter(a => a.type === "Other").length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Other Accounts</CardTitle>
                <Badge variant="muted">{fmt(notionOtherTotal)}</Badge>
              </CardHeader>
              <div className="flex flex-col gap-2">
                {notionAccounts.filter(a => a.type === "Other").map(a => <AccountRow key={a.id} a={a} />)}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {tab === "transactions" && (
        <div className="flex flex-col gap-4 animate-fade-up stagger-3">

          {/* Unreviewed (Plaid inbox) */}
          {inbox.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-warning" />
                  <CardTitle>To Review</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={runAlfredAutoCategorize}
                    disabled={autoCatLoading}
                    className="text-[11px] font-600 px-2.5 py-1 rounded-[8px] bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
                  >
                    {autoCatLoading
                      ? (autoCatProgress
                          ? `Alfred… ${autoCatProgress.processed} done · ${autoCatProgress.remaining} left`
                          : "Alfred is sorting…")
                      : "✨ Alfred: auto-categorize"}
                  </button>
                  <Badge variant="warning">{inbox.length}</Badge>
                </div>
              </CardHeader>
              {autoCatResult && (
                <div className="mb-2 px-3 py-2 rounded-[10px] bg-[rgba(29,155,240,0.08)] border border-[rgba(29,155,240,0.2)] text-[12px] text-text-2 flex flex-col gap-1">
                  <div>
                    Alfred processed <span className="font-700 text-text-1">{autoCatResult.processed}</span> · auto-confirmed <span className="font-700 text-accent">{autoCatResult.autoConfirmed}</span> to Notion · flagged <span className="font-700 text-warning">{autoCatResult.flagged}</span> for your review.
                  </div>
                  {autoCatResult.errors && autoCatResult.errors.length > 0 && (
                    <div className="text-[11px] text-danger">
                      {autoCatResult.errors.length} write error(s) — first: {autoCatResult.errors[0]}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {inbox.map(tx => {
                  const isOpen = expandedTx === tx.plaid_transaction_id;
                  return (
                    <div key={tx.plaid_transaction_id} className="rounded-[12px] bg-[rgba(251,191,36,0.04)] border border-[rgba(251,191,36,0.18)] overflow-hidden">
                      <button
                        onClick={() => setExpandedTx(isOpen ? null : tx.plaid_transaction_id)}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                      >
                        <span className="w-2 h-2 rounded-full bg-warning animate-led flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-600 text-text-1 truncate">{tx.merchant_name}</p>
                          <p className="text-[11px] text-text-3">{tx.date} · {tx.suggested_category}</p>
                        </div>
                        <p className="text-[14px] font-700 tabular-nums font-mono text-danger">{fmt(Number(tx.amount))}</p>
                        {isOpen ? <ChevronUp size={14} className="text-text-3" /> : <ChevronDown size={14} className="text-text-3" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3">
                          <ConfirmForm tx={tx} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Ledger history */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              {loadingLedger ? <span className="text-[11px] text-text-3">Loading…</span> : <Badge variant="muted">{ledgerEntries.length}</Badge>}
            </CardHeader>
            {ledgerEntries.length === 0 ? (
              <p className="text-[12px] text-text-3 italic text-center py-6">No transactions in the last 60 days</p>
            ) : (
              <div className="flex flex-col gap-4">
                {ledgerDates.map(date => (
                  <div key={date} className="flex flex-col gap-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-text-3 px-1">{dateGroupLabel(date)}</p>
                    {ledgerByDate[date].map(e => {
                      const color = CAT_COLORS[e.category] ?? "#94a3b8";
                      const isIncome = e.transactionType === "Income";
                      const isTransfer = e.transactionType === "Transfer";
                      const fromName = e.fromAccountId ? accountNameById.get(e.fromAccountId) : null;
                      return (
                        <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-600 text-text-1 truncate">{e.name}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-text-3">{e.category}</span>
                              {fromName && <span className="text-[10px] text-text-3">· {fromName}</span>}
                              {e.status === "Pending" && <span className="text-[10px] text-warning font-600">· Pending</span>}
                            </div>
                          </div>
                          <p className={`text-[13px] font-700 tabular-nums font-mono ${
                            isIncome ? "text-success" : isTransfer ? "text-text-2" : "text-text-1"
                          }`}>
                            {isIncome ? "+" : isTransfer ? "" : "-"}{fmt(Number(e.amount))}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── WEALTH TAB ── */}
      {tab === "wealth" && (
        <div className="flex flex-col gap-4 animate-fade-up stagger-3">

          {/* Burn summary */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <div className="flex items-center gap-2 mb-2"><TrendingDown size={14} className="text-danger" /><CardTitle>Monthly Burn</CardTitle></div>
              <p className="text-[22px] font-700 tabular-nums text-danger font-mono">{fmt(monthlyBurn)}</p>
              <p className="text-[11px] text-text-3 mt-1">~{fmt(monthlyBurn * 12)} / year</p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-2"><TrendingUp size={14} className="text-success" /><CardTitle>Recurring Income</CardTitle></div>
              <p className="text-[22px] font-700 tabular-nums text-success font-mono">{fmt(monthlyIncome)}</p>
              <p className="text-[11px] text-text-3 mt-1">detected by Plaid</p>
            </Card>
          </div>

          {/* Runway Calculator */}
          {(() => {
            const spend = monthExpense > 0 ? monthExpense : (monthlyBurn > 0 ? monthlyBurn : 1);
            const liquidMonths = banksTotal / spend;
            const totalMonths  = netWorth   / spend;
            const doomDate = new Date();
            doomDate.setMonth(doomDate.getMonth() + Math.floor(liquidMonths));
            const doomStr = doomDate.toLocaleDateString("en-CA", { month: "short", year: "numeric" });
            const runColor = liquidMonths < 3 ? "#f87171" : liquidMonths < 6 ? "#fbbf24" : "#34d399";
            const barPct = Math.min((liquidMonths / 24) * 100, 100);
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">🕳️</span>
                    <CardTitle>Runway</CardTitle>
                  </div>
                  <span className="text-[11px] text-text-3">liquid ÷ spend</span>
                </CardHeader>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-[32px] font-700 tabular-nums font-mono" style={{ color: runColor }}>
                    {liquidMonths >= 999 ? "∞" : liquidMonths.toFixed(1)}
                  </span>
                  <span className="text-[13px] text-text-3 mb-1">months of cash</span>
                </div>
                <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${barPct}%`, background: runColor, boxShadow: `0 0 8px ${runColor}60` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] text-text-3">Monthly spend</p>
                    <p className="text-[13px] font-700 tabular-nums font-mono text-danger">{fmt(spend)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-3">Liquid assets</p>
                    <p className="text-[13px] font-700 tabular-nums font-mono text-text-1">{fmt(banksTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-3">Cash-zero date</p>
                    <p className="text-[13px] font-700 tabular-nums font-mono" style={{ color: runColor }}>{doomStr}</p>
                  </div>
                </div>
                {totalMonths > liquidMonths && (
                  <p className="text-[10px] text-text-3 mt-3 text-center">
                    Total NW runway (illiquid incl.): {totalMonths.toFixed(1)} mo
                  </p>
                )}
              </Card>
            );
          })()}

          {/* Subscriptions */}
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
              <Badge variant="muted">{subs.filter(s => s.isActive).length} active</Badge>
            </CardHeader>
            {loadingSubs ? (
              <p className="text-[12px] text-text-3 text-center py-6">Loading from Plaid…</p>
            ) : subs.length === 0 ? (
              <p className="text-[12px] text-text-3 italic text-center py-6">
                {isLinked ? "No recurring payments detected yet" : "Connect your bank to auto-detect subscriptions"}
              </p>
            ) : subs.filter(s => s.isActive).map(s => {
              const pct = netWorth > 0 ? (s.monthlyCad / netWorth) * 100 : 0;
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-600 text-text-1 truncate">{s.name}</p>
                    <p className="text-[11px] text-text-3">{freqLabel(s.frequency)} · {s.category}</p>
                    {s.nextDate && <p className="text-[10px] text-warning mt-0.5">↻ Next {s.nextDate}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[15px] font-700 tabular-nums font-mono text-danger">{fmt(s.monthlyCad)}<span className="text-[10px] text-text-3 font-400">/mo</span></p>
                    {netWorth > 0 && <p className={`text-[10px] font-700 mt-0.5 ${pctClass(pct)}`}>{pct.toFixed(2)}% of NW</p>}
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Income streams */}
          {income.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recurring Income</CardTitle><Badge variant="success">{income.length}</Badge></CardHeader>
              {income.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-3 py-3 rounded-[10px] bg-[rgba(52,211,153,0.04)] mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-600 text-text-1 truncate">{s.name}</p>
                    <p className="text-[11px] text-text-3">{freqLabel(s.frequency)}</p>
                  </div>
                  <p className="text-[15px] font-700 tabular-nums font-mono text-success">{fmt(s.monthlyCad)}<span className="text-[10px] text-text-3 font-400">/mo</span></p>
                </div>
              ))}
            </Card>
          )}

          {/* Manual assets */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Assets</CardTitle>
              <Badge variant="muted">{fmt(manualTotal)}</Badge>
            </CardHeader>
            <div className="flex flex-col gap-2 mb-4">
              {manualAssets.length === 0 ? (
                <p className="text-[12px] text-text-3 italic text-center py-3">No manual assets yet — add crypto, real estate, etc.</p>
              ) : manualAssets.map(a => {
                const cat = ASSET_CATS.find(c => c.key === a.category);
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                    <span className="text-[16px]">{cat?.emoji ?? "💼"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-600 text-text-1 truncate">{a.name}</p>
                      <p className="text-[11px] text-text-3">{cat?.label}</p>
                    </div>
                    <p className="text-[14px] font-700 tabular-nums font-mono text-text-1">{fmt(Number(a.amount_cad))}</p>
                    <button onClick={() => deleteAsset(a.id)} className="text-text-3 hover:text-danger transition-colors p-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <select
                  value={assetForm.category}
                  onChange={e => setAssetForm(f => ({ ...f, category: e.target.value }))}
                  className="px-3 py-2 text-[12px] rounded-[10px] flex-shrink-0"
                >
                  {ASSET_CATS.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  value={assetForm.name}
                  onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addAsset()}
                  placeholder="e.g. Bitcoin, Tesla shares…"
                  className="flex-1 px-3 py-2 text-[13px]"
                />
                <input
                  type="number"
                  value={assetForm.amount}
                  onChange={e => setAssetForm(f => ({ ...f, amount: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && addAsset()}
                  placeholder="CAD value"
                  className="w-[110px] px-3 py-2 text-[13px]"
                />
                <Button variant="primary" size="sm" onClick={addAsset}><Plus size={14} /></Button>
              </div>
            </div>
          </Card>

          {/* Life Simulation */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-[14px]">🔮</span>
                <CardTitle>Life Simulation</CardTitle>
              </div>
              <span className="text-[11px] text-text-3">Monte Carlo · 3 scenarios</span>
            </CardHeader>
            <LifeSimCard
              netWorth={netWorth}
              monthlySavings={monthlyIncome > 0 ? Math.max(0, monthlyIncome - (monthExpense > 0 ? monthExpense : monthlyBurn)) : 500}
            />
          </Card>

          {/* Wishlist */}
          <Card>
            <CardHeader>
              <CardTitle>Wishlist</CardTitle>
              <Badge variant="muted">{fmt(wishTotal)}</Badge>
            </CardHeader>
            <div className="flex gap-2 mb-3">
              <input
                value={wishForm.name}
                onChange={e => setWishForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addWish()}
                placeholder="Item name…"
                className="flex-1 px-3 py-2 text-[13px]"
              />
              <input
                type="number"
                value={wishForm.amount}
                onChange={e => setWishForm(f => ({ ...f, amount: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && addWish()}
                placeholder="CAD"
                className="w-[100px] px-3 py-2 text-[13px]"
              />
              <Button variant="primary" size="sm" onClick={addWish}><Plus size={14} /></Button>
            </div>
            <div className="flex flex-col gap-2">
              {wishlist.length === 0 ? (
                <p className="text-[12px] text-text-3 italic text-center py-3">Nothing on your wishlist yet</p>
              ) : wishlist.map(w => {
                const pct = netWorth > 0 ? (Number(w.amount_cad) / netWorth) * 100 : null;
                const cls = pct != null ? pctClass(pct) : "text-text-3";
                return (
                  <div key={w.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-600 text-text-1">{w.name}</p>
                      {pct != null && <p className={`text-[11px] font-700 mt-0.5 ${cls}`}>{pct.toFixed(2)}% of NW</p>}
                    </div>
                    <p className="text-[14px] font-700 tabular-nums font-mono text-text-1">{fmt(Number(w.amount_cad))}</p>
                    <button onClick={() => deleteWish(w.id)} className="text-text-3 hover:text-danger transition-colors p-1">
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "tax" && (() => {
        const year = new Date().getFullYear();
        const yearStart = `${year}-01-01`;
        const yearEntries = ledgerEntries.filter(e => e.date >= yearStart);
        const ytdIncome  = yearEntries.filter(e => e.transactionType === "Income").reduce((s, e) => s + Number(e.amount), 0);
        const ytdExpense = yearEntries.filter(e => e.transactionType === "Expense").reduce((s, e) => s + Number(e.amount), 0);
        const ytdTax     = yearEntries.filter(e => e.transactionType === "Tax Payment").reduce((s, e) => s + Number(e.amount), 0);
        const ytdBiz     = yearEntries.filter(e => e.transactionType === "Expense" && Number(e.businessUsePct) > 0)
                                      .reduce((s, e) => s + Number(e.amount) * Number(e.businessUsePct) / 100, 0);
        const ytdNet     = ytdIncome - ytdExpense - ytdTax;

        // Category breakdown of expenses
        const expByCat = yearEntries
          .filter(e => e.transactionType === "Expense")
          .reduce<Record<string, number>>((acc, e) => {
            acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
            return acc;
          }, {});
        const sortedCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]);

        // CSV export
        function exportCsv() {
          const rows = [
            ["Date", "Name", "Type", "Category", "Amount (CAD)", "Business %", "Notes"],
            ...yearEntries.map(e => [e.date, e.name, e.transactionType, e.category, e.amount, e.businessUsePct, e.notes]),
          ];
          const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = `spicer-os-${year}-tax.csv`; a.click();
          URL.revokeObjectURL(url);
        }

        return (
          <div className="flex flex-col gap-4 animate-fade-up stagger-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-700 text-text-1">{year} Tax Summary</h2>
                <p className="text-[11px] text-text-3">Year-to-date from ledger</p>
              </div>
              <button
                onClick={exportCsv}
                className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-600 bg-[rgba(29,155,240,0.08)] border border-[rgba(29,155,240,0.2)] text-accent hover:bg-[rgba(29,155,240,0.14)] transition-all"
              >
                ↓ Export CSV
              </button>
            </div>

            {/* YTD summary */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <div className="text-[11px] text-text-3 mb-1">YTD Revenue</div>
                <p className="text-[22px] font-700 tabular-nums font-mono text-success">{fmt(ytdIncome)}</p>
              </Card>
              <Card>
                <div className="text-[11px] text-text-3 mb-1">YTD Expenses</div>
                <p className="text-[22px] font-700 tabular-nums font-mono text-danger">{fmt(ytdExpense)}</p>
              </Card>
              <Card>
                <div className="text-[11px] text-text-3 mb-1">Tax Paid</div>
                <p className="text-[22px] font-700 tabular-nums font-mono text-warning">{fmt(ytdTax)}</p>
              </Card>
              <Card>
                <div className="text-[11px] text-text-3 mb-1">Net Profit</div>
                <p className={`text-[22px] font-700 tabular-nums font-mono ${ytdNet >= 0 ? "text-success" : "text-danger"}`}>{fmtSigned(ytdNet)}</p>
              </Card>
            </div>

            {/* Business deductions */}
            {ytdBiz > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[14px]">🏢</span>
                  <CardTitle>Business Deductions</CardTitle>
                </div>
                <p className="text-[22px] font-700 tabular-nums font-mono text-accent">{fmt(ytdBiz)}</p>
                <p className="text-[11px] text-text-3 mt-1">Estimated deductible portion of expenses</p>
              </Card>
            )}

            {/* Expense breakdown */}
            {sortedCats.length > 0 && (
              <Card>
                <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
                <div className="flex flex-col gap-2">
                  {sortedCats.map(([cat, amt]) => {
                    const pct = ytdExpense > 0 ? (amt / ytdExpense) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12px] text-text-2">{cat}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-text-3">{pct.toFixed(0)}%</span>
                            <span className="text-[12px] font-700 tabular-nums font-mono text-text-1">{fmt(amt)}</span>
                          </div>
                        </div>
                        <div className="h-1 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: CAT_COLORS[cat] ?? "#94a3b8" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {yearEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-[32px]">🧾</p>
                <p className="text-[13px] text-text-3">No ledger entries for {year} yet.</p>
              </div>
            )}
          </div>
        );
      })()}

      </>)}
    </div>
    </FinanceVaultGate>
  );
}
