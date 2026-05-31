"use client";
// Weekly reconcile reminder picker. Set the day → 7am Toronto on that day
// you get a push + a separate email reminding you to upload bank CSVs.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Banknote } from "lucide-react";

const DAYS = [
  { v: 0, label: "Sunday" },
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
];

export function ReconcileReminder() {
  const [dow, setDow] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/alfred/reminders")
      .then(r => r.json())
      .then(d => setDow(d.reconcile_dow ?? null))
      .finally(() => setLoaded(true));
  }, []);

  async function save(next: number | null) {
    setBusy(true);
    try {
      const r = await fetch("/api/alfred/reminders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconcile_dow: next ?? "off" }),
      });
      if (r.ok) {
        setDow(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(52,211,153,0.10)] border border-[rgba(52,211,153,0.22)] flex items-center justify-center flex-shrink-0">
          <Banknote size={18} className="text-success" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Weekly reconcile reminder</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            On the chosen day at 7am Toronto, push notification + email asking you to upload this week's CSVs from RBC + TD into /finances.
          </p>
        </div>
      </div>

      {loaded && (
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => save(null)}
            disabled={busy}
            className={`px-3 py-2 rounded-[10px] text-[11px] font-600 border transition-all ${
              dow === null
                ? "bg-[rgba(255,255,255,0.06)] border-border text-text-1"
                : "bg-transparent border-border-dim text-text-3 hover:text-text-2 hover:border-border"
            }`}
          >Off</button>
          {DAYS.map(d => (
            <button
              key={d.v}
              onClick={() => save(d.v)}
              disabled={busy}
              className={`px-3 py-2 rounded-[10px] text-[11px] font-600 border transition-all ${
                dow === d.v
                  ? "bg-success/20 border-success text-success"
                  : "bg-transparent border-border-dim text-text-3 hover:text-text-2 hover:border-border"
              }`}
            >{d.label.slice(0, 3)}</button>
          ))}
        </div>
      )}

      {saved && <p className="text-[11px] text-success text-center">✓ Saved</p>}

      {dow !== null && (
        <p className="text-[10px] text-text-3 italic text-center">
          Next reminder: this <b className="text-text-2">{DAYS.find(d => d.v === dow)?.label}</b> at 7am Toronto, alongside your morning brief.
        </p>
      )}
    </Card>
  );
}
