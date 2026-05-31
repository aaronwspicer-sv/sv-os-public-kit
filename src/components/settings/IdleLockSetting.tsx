"use client";
// Dropdown to choose the idle auto-lock duration. Stored in localStorage so
// it applies per-device — your phone can be 5min, your laptop 30min.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Clock } from "lucide-react";

const KEY = "spicer_os_idle_minutes";
const DEFAULT = 15;

const OPTIONS = [
  { value: 5,   label: "5 minutes"  },
  { value: 15,  label: "15 minutes (recommended)" },
  { value: 30,  label: "30 minutes" },
  { value: 60,  label: "1 hour"     },
  { value: 0,   label: "Off — never auto-lock" },
];

export function IdleLockSetting() {
  const [minutes, setMinutes] = useState<number>(DEFAULT);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n >= 0) setMinutes(n);
      }
    } catch {}
  }, []);

  function update(v: number) {
    setMinutes(v);
    try { localStorage.setItem(KEY, String(v)); } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(251,191,36,0.10)] border border-[rgba(251,191,36,0.22)] flex items-center justify-center flex-shrink-0">
          <Clock size={18} className="text-warning" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Idle auto-lock</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            After this many minutes of no activity (mouse, key, touch, scroll), the
            PIN gate re-locks and the Finance Vault closes. Per-device setting.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {OPTIONS.map(o => (
          <label
            key={o.value}
            className={`flex items-center justify-between p-3 rounded-[12px] border cursor-pointer transition-all ${
              minutes === o.value
                ? "bg-accent-dim border-[rgba(29,155,240,0.32)]"
                : "bg-[rgba(255,255,255,0.02)] border-border-dim hover:border-border"
            }`}
          >
            <span className="text-[12px] font-600 text-text-1">{o.label}</span>
            <input
              type="radio"
              name="idle-minutes"
              value={o.value}
              checked={minutes === o.value}
              onChange={() => update(o.value)}
              className="w-4 h-4 accent-accent"
            />
          </label>
        ))}
      </div>

      {saved && <p className="text-[11px] text-success text-center">✓ Saved</p>}
    </Card>
  );
}
