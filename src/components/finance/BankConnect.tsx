"use client";
// Drag-drop CSV importer for bank statements.
// Replaces the old aggregator-based "Connect Your Bank" button — we now
// import directly from each bank's CSV export. Zero third-party risk,
// no age gates, no provider sales calls.
//
// Supported (auto-detected): RBC, TD. Easy to add more — see src/lib/import/csv.ts.
//
// Files are POSTed to /api/bank/import which parses, dedupes (stable hash
// on date+amount+description), and writes to bank_transactions.
import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Check, AlertCircle, Loader2, Pencil, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";

// ── Editable balance row (used for accounts where the bank CSV doesn't
//    include running balance — RBC). Click pencil → inline number input. ──
interface AcctRow {
  id: string;
  name: string | null;
  institution: string | null;
  category: string | null;
  currency: string | null;
  balance: number | null;
}

function EditableAccount({ acct, onSaved }: { acct: AcctRow; onSaved: () => void }) {
  const [editingField, setEditingField] = useState<"balance" | "name" | null>(null);
  const [balanceVal, setBalanceVal] = useState<string>(acct.balance != null ? String(acct.balance) : "");
  const [nameVal, setNameVal]       = useState<string>(acct.name ?? "");
  const [busy, setBusy] = useState(false);

  async function saveBalance() {
    const n = Number(balanceVal);
    if (!Number.isFinite(n)) return;
    setBusy(true);
    try {
      await fetch("/api/bank/accounts/balance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acct.id, balance: n }),
      });
      setEditingField(null);
      onSaved();
    } finally { setBusy(false); }
  }
  async function saveName() {
    const trimmed = nameVal.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await fetch("/api/bank/accounts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acct.id, name: trimmed }),
      });
      setEditingField(null);
      onSaved();
    } finally { setBusy(false); }
  }

  const isLiability = acct.category === "credit_card" || acct.category === "loan";
  const balanceColor = acct.balance == null ? "text-text-3" : isLiability ? "text-warning" : "text-text-1";
  const balanceStr = acct.balance == null ? "—" : `${isLiability ? "-" : ""}$${Math.abs(acct.balance).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
      <div className="flex-1 min-w-0">
        {editingField === "name" ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingField(null); }}
              maxLength={60}
              placeholder="Nickname (e.g. 'Daily chequing')"
              className="flex-1 px-2 py-1 text-[12px]"
            />
            <button onClick={saveName} disabled={busy} className="p-1 rounded-md text-success hover:bg-[rgba(52,211,153,0.10)]">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button onClick={() => { setNameVal(acct.name ?? ""); setEditingField(null); }} className="p-1 rounded-md text-text-3 hover:bg-[rgba(255,255,255,0.06)]">
              <XIcon size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingField("name")}
            className="group flex items-center gap-1.5 text-left"
            title="Rename"
          >
            <p className="text-[12px] font-600 text-text-1 truncate">{acct.name ?? "Account"}</p>
            <Pencil size={9} className="opacity-0 group-hover:opacity-60 text-text-3 transition-opacity flex-shrink-0" />
          </button>
        )}
        <p className="text-[10px] text-text-3">{acct.institution ?? ""}{acct.category ? ` · ${acct.category}` : ""}</p>
      </div>
      {editingField === "balance" ? (
        <div className="flex items-center gap-1">
          <input
            type="number" step="0.01" autoFocus
            value={balanceVal}
            onChange={e => setBalanceVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") saveBalance(); if (e.key === "Escape") setEditingField(null); }}
            className="w-28 px-2 py-1 text-[12px] font-mono text-right"
          />
          <button onClick={saveBalance} disabled={busy} className="p-1 rounded-md text-success hover:bg-[rgba(52,211,153,0.10)]">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditingField(null)} className="p-1 rounded-md text-text-3 hover:bg-[rgba(255,255,255,0.06)]">
            <XIcon size={12} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className={`text-[13px] font-700 font-mono tabular-nums ${balanceColor}`}>{balanceStr}</span>
          <button onClick={() => setEditingField("balance")} className="p-1 rounded-md text-text-3 hover:text-text-1" title="Edit balance">
            <Pencil size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

function AccountsList({ refreshKey }: { refreshKey: number }) {
  const [accounts, setAccounts] = useState<AcctRow[] | null>(null);
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    fetch("/api/bank/accounts")
      .then(r => r.json())
      .then(d => setAccounts(d.accounts ?? []))
      .catch(() => setAccounts([]));
  }, [refreshKey, nudge]);
  if (!accounts) return null;
  if (accounts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-3 font-600">Imported accounts</p>
      <div className="flex flex-col gap-1.5">
        {accounts.map(a => (
          <EditableAccount key={a.id} acct={a} onSaved={() => setNudge(n => n + 1)} />
        ))}
      </div>
      <p className="text-[10px] text-text-3 italic">
        TD balances auto-update on each CSV upload. RBC balances are manual — tap the pencil to edit.
      </p>
    </div>
  );
}

interface Props {
  className?: string;
  /** Fires after every successful upload — parent can flip onboarding → dashboard. */
  onUploadComplete?: () => void;
}
interface UploadResult {
  ok?: boolean;
  bank?: string;
  parsed?: number;
  inserted?: number;
  skipped?: number;
  warnings?: string[];
  error?: string;
}

export function BankConnect({ className, onUploadComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [results, setResults]   = useState<{ name: string; result: UploadResult }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [acctRefreshKey, setAcctRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => /\.csv$/i.test(f.name));
    if (arr.length === 0) return;
    setUploading(true);
    const next: { name: string; result: UploadResult }[] = [];
    for (const f of arr) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/bank/import", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        next.push({ name: f.name, result: d });
      } catch (err: any) {
        next.push({ name: f.name, result: { error: err?.message ?? "Upload failed" } });
      }
    }
    setResults(prev => [...next, ...prev].slice(0, 12));
    setAcctRefreshKey(k => k + 1);
    setUploading(false);
    // Notify parent so the finances page can flip from onboarding → dashboard
    // if at least one file actually parsed.
    if (next.some(r => r.result.ok)) onUploadComplete?.();
  }, [onUploadComplete]);

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 px-6 py-10 rounded-[16px] border-2 border-dashed cursor-pointer transition-all ${
          dragging
            ? "border-accent bg-accent-dim"
            : "border-border-dim bg-[rgba(255,255,255,0.02)] hover:border-accent/40 hover:bg-[rgba(29,155,240,0.03)]"
        }`}
      >
        <input
          ref={fileRef} type="file" accept=".csv,text/csv" multiple className="hidden"
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
        />
        {uploading ? (
          <>
            <Loader2 size={28} className="text-accent animate-spin" />
            <p className="text-[13px] text-text-2">Parsing + importing…</p>
          </>
        ) : (
          <>
            <Upload size={28} className="text-accent" />
            <div className="text-center">
              <p className="text-[14px] font-600 text-text-1">Drop a bank CSV here</p>
              <p className="text-[11px] text-text-3 mt-0.5">or click to choose · RBC + TD auto-detected · multiple files OK</p>
            </div>
          </>
        )}
      </div>

      {/* Helper */}
      <div className="text-[11px] text-text-3 leading-snug p-3 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
        <p className="font-600 text-text-2 mb-1">How to export a CSV:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li><b>RBC Online Banking</b> → click the account → <b>Download Transactions</b> → CSV format</li>
          <li><b>TD EasyWeb</b> → click the account → <b>Download Transactions</b> → CSV (Money / Spreadsheet)</li>
        </ul>
        <p className="mt-1 text-text-3">Duplicate transactions are filtered automatically — safe to re-upload.</p>
      </div>

      {/* Editable account list — balances roll into net worth */}
      <AccountsList refreshKey={acctRefreshKey} />

      {/* Results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map((r, i) => {
            const ok = r.result.ok;
            return (
              <div key={i} className={`flex items-center gap-2 p-2.5 rounded-[10px] border ${
                ok ? "bg-[rgba(52,211,153,0.06)] border-[rgba(52,211,153,0.22)]"
                   : "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.30)]"
              }`}>
                {ok ? <Check size={13} className="text-success flex-shrink-0" /> : <AlertCircle size={13} className="text-danger flex-shrink-0" />}
                <FileText size={13} className="text-text-3 flex-shrink-0" />
                <span className="text-[12px] font-600 text-text-1 truncate flex-1">{r.name}</span>
                {ok
                  ? <span className="text-[11px] text-success">{r.result.bank} · {r.result.inserted ?? 0} added · {r.result.skipped ?? 0} dup</span>
                  : <span className="text-[11px] text-danger truncate max-w-[200px]">{r.result.error ?? "Failed"}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Backwards-compatible default export name kept as BankConnect so the
// finances page doesn't need an import rename.
export default BankConnect;

// Convenience: button that triggers a hidden picker (for use elsewhere)
export function BankImportButton({ onDone }: { onDone?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" multiple className="hidden"
        onChange={async e => {
          if (!e.target.files?.length) return;
          setBusy(true);
          for (const f of Array.from(e.target.files)) {
            const fd = new FormData(); fd.append("file", f);
            await fetch("/api/bank/import", { method: "POST", body: fd });
          }
          e.target.value = "";
          setBusy(false);
          onDone?.();
        }}
      />
      <Button variant="primary" onClick={() => ref.current?.click()} loading={busy}>
        <Upload size={14} /> Import CSV
      </Button>
    </>
  );
}
