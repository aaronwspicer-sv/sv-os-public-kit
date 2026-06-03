"use client";
import { useEffect, useState, useRef } from "react";
import { useDemoMode } from "@/components/ui/DemoModeContext";

interface Snapshot { snapshot_date: string; amount_cad: number }

function SparkArea({ data, color = "#1d9bf0" }: { data: number[]; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 300, h: 80 });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  if (data.length < 2) return null;
  const { w, h } = dims;
  const pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (w - pad * 2),
    y: pad + ((1 - (v - min) / range) * (h - pad * 2)),
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${(h - pad).toFixed(1)} L${pts[0].x.toFixed(1)},${(h - pad).toFixed(1)} Z`;

  return (
    <svg ref={ref} className="w-full h-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="nw-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#nw-grad)" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last point dot */}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={color} />
    </svg>
  );
}

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  /** Immediately known net worth to record a snapshot for today. */
  currentNetWorth: number;
  breakdown?: { banks: number; manual: number; other: number };
}

export function NetWorthChart({ currentNetWorth, breakdown }: Props) {
  const { isDemoMode } = useDemoMode();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading]     = useState(true);
  const [months, setMonths]       = useState(12);

  // Record today's snapshot once per session
  useEffect(() => {
    if (isDemoMode) return; // never write to the DB in demo
    if (!isFinite(currentNetWorth) || currentNetWorth === 0) return;
    fetch("/api/net-worth-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount_cad: currentNetWorth, breakdown: breakdown ?? {} }),
    }).catch(() => {});
  }, [currentNetWorth, breakdown, isDemoMode]);

  useEffect(() => {
    if (isDemoMode) {
      // Synthesize a believable upward series ending at the (demo) net worth.
      const now = new Date();
      setSnapshots(Array.from({ length: months }, (_, i) => {
        const d = new Date(now); d.setMonth(d.getMonth() - (months - 1 - i));
        const t = months > 1 ? i / (months - 1) : 1;
        const amt = Math.round(currentNetWorth * (0.55 + 0.45 * t) + Math.sin(i * 1.3) * 900);
        return { snapshot_date: d.toISOString().slice(0, 10), amount_cad: amt };
      }));
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/net-worth-history?months=${months}`)
      .then(r => r.json())
      .then(d => { if (d.snapshots) setSnapshots(d.snapshots); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [months, isDemoMode, currentNetWorth]);

  if (loading) return (
    <div className="h-[100px] flex items-center justify-center">
      <p className="text-[11px] text-text-3">Loading history…</p>
    </div>
  );

  if (snapshots.length < 2) return (
    <div className="h-[60px] flex items-center justify-center">
      <p className="text-[11px] text-text-3 italic">Check back once you have a few days of data.</p>
    </div>
  );

  const values = snapshots.map(s => Number(s.amount_cad));
  const first  = values[0];
  const last   = values[values.length - 1];
  const delta  = last - first;
  const pct    = first !== 0 ? (delta / Math.abs(first)) * 100 : 0;
  const up     = delta >= 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-700 tabular-nums font-mono ${up ? "text-success" : "text-danger"}`}>
            {up ? "+" : ""}{fmtShort(delta)}
          </span>
          <span className={`text-[11px] ${up ? "text-success" : "text-danger"}`}>
            ({up ? "+" : ""}{pct.toFixed(1)}%)
          </span>
          <span className="text-[10px] text-text-3">vs {months}mo ago</span>
        </div>
        <div className="flex gap-1">
          {[3, 6, 12, 24].map(m => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`text-[10px] px-2 py-0.5 rounded-[6px] font-600 transition-colors ${
                months === m
                  ? "bg-accent text-white"
                  : "text-text-3 hover:text-text-1 border border-border-dim"
              }`}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>
      <div className="h-[80px]">
        <SparkArea data={values} color={up ? "#34d399" : "#f87171"} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-text-3 tabular-nums font-mono">
        <span>{snapshots[0]?.snapshot_date}</span>
        <span>{snapshots[snapshots.length - 1]?.snapshot_date}</span>
      </div>
    </div>
  );
}
