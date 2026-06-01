"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  netWorth: number;
  monthlySavings: number;
}

const SCENARIOS = [
  { label: "Bear",  rate: 0.04, color: "#f87171" },
  { label: "Base",  rate: 0.07, color: "#1d9bf0" },
  { label: "Bull",  rate: 0.12, color: "#34d399" },
] as const;

function fmtShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function project(nw: number, monthly: number, annualRate: number, years: number): number[] {
  const monthlyRate = annualRate / 12;
  const pts: number[] = [nw];
  let v = nw;
  for (let m = 0; m < years * 12; m++) {
    v = v * (1 + monthlyRate) + monthly;
    if ((m + 1) % 12 === 0) pts.push(v);
  }
  return pts; // length = years + 1
}

function SimChart({ series, years }: { series: { color: string; pts: number[] }[]; years: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 300, h: 120 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      setDims({ w: width, h: height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const { w, h } = dims;
  const pad = { t: 8, b: 8, l: 8, r: 8 };
  const allVals = series.flatMap(s => s.pts);
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;
  const totalPts = series[0]?.pts.length ?? 2;

  function toX(i: number) { return pad.l + (i / (totalPts - 1)) * (w - pad.l - pad.r); }
  function toY(v: number) { return pad.t + ((1 - (v - min) / range) * (h - pad.t - pad.b)); }

  return (
    <svg ref={ref} className="w-full" style={{ height: h }} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {series.map(({ color, pts }, si) => {
        const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
        const area = `${line} L${toX(pts.length - 1).toFixed(1)},${(h - pad.b).toFixed(1)} L${toX(0).toFixed(1)},${(h - pad.b).toFixed(1)} Z`;
        return (
          <g key={si}>
            <path d={area} fill={color} fillOpacity="0.07" />
            <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
    </svg>
  );
}

export function LifeSimCard({ netWorth, monthlySavings }: Props) {
  const [monthly, setMonthly] = useState(() => Math.max(0, Math.round(monthlySavings)));
  const [horizon, setHorizon] = useState<5 | 10 | 20>(20);

  const series = SCENARIOS.map(s => ({
    label: s.label,
    color: s.color,
    rate:  s.rate,
    pts:   project(netWorth, monthly, s.rate, horizon),
  }));

  const milestones = [100_000, 250_000, 500_000, 1_000_000] as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-3 w-[90px] flex-shrink-0">Monthly saved</span>
          <input
            type="range" min={0} max={10000} step={100}
            value={monthly}
            onChange={e => setMonthly(Number(e.target.value))}
            className="flex-1 accent-[#1d9bf0]"
          />
          <span className="text-[12px] font-700 tabular-nums font-mono text-text-1 w-[54px] text-right">
            ${monthly.toLocaleString()}
          </span>
        </div>
        <div className="flex gap-1.5">
          {([5, 10, 20] as const).map(y => (
            <button
              key={y}
              onClick={() => setHorizon(y)}
              className={`text-[10px] px-2.5 py-1 rounded-[6px] font-600 transition-colors ${
                horizon === y ? "bg-accent text-white" : "text-text-3 border border-border-dim hover:text-text-1"
              }`}
            >{y}y</button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[120px]">
        <SimChart series={series} years={horizon} />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2">
        {series.map(s => (
          <div key={s.label} className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-[10px] text-text-3">{s.label} ({(s.rate * 100).toFixed(0)}%)</span>
            </div>
            <p className="text-[14px] font-700 tabular-nums font-mono" style={{ color: s.color }}>
              {fmtShort(s.pts[s.pts.length - 1])}
            </p>
          </div>
        ))}
      </div>

      {/* Milestones (base scenario) */}
      {(() => {
        const basePts = series.find(s => s.label === "Base")!.pts;
        const baseMonthly = project(netWorth, monthly, 0.07, 40);
        return (
          <div className="grid grid-cols-2 gap-2">
            {milestones.map(m => {
              if (netWorth >= m) return null;
              let monthsToM: number | null = null;
              const r = 0.07 / 12;
              let v = netWorth;
              for (let mo = 0; mo < 40 * 12; mo++) {
                v = v * (1 + r) + monthly;
                if (v >= m) { monthsToM = mo + 1; break; }
              }
              if (monthsToM === null) return null;
              const yrs = (monthsToM / 12).toFixed(1);
              return (
                <div key={m} className="px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
                  <p className="text-[10px] text-text-3">{fmtShort(m)} milestone</p>
                  <p className="text-[12px] font-700 text-text-1">{yrs}y away</p>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
