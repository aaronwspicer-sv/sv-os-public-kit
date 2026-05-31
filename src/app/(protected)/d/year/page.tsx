"use client";
import { useEffect, useState, useMemo } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { currencySymbol } from "@/lib/money";
import {
  Calendar, Flame, Clock, Eye, Dumbbell, DollarSign,
  Video, Target, Award, ChevronLeft, ChevronRight,
} from "lucide-react";

interface DailyEntry { date: string; habitCount: number; hours: number; logged: boolean; }
interface MonthlyEntry { month: number; hours: number; income: number; expense: number; published: number; byPillar: Record<string, number>; }
interface YearStats {
  year: number;
  log: {
    totalDaysLogged: number;
    workoutDays: number; nfDays: number; videoDays: number; journalDays: number;
    totalHours: number; totalViewsLogged: number;
    bestDay: { date: string; hours: number; habits: number } | null;
    longestStreaks: { workout: number; nf: number; video: number; journal: number };
    daily: DailyEntry[];
  };
  money: {
    income: number; expense: number; net: number;
    topCategories: { category: string; amount: number }[];
  };
  content: {
    published: number; longForm: number; shortForm: number; totalViews: number;
    byPillar: { pillar: string; count: number; views: number }[];
  };
  todos: { total: number; done: number; completionRate: number };
  monthly: MonthlyEntry[];
}

const PILLAR_COLOR: Record<string, string> = {
  Journey: "#a78bfa", Process: "#1D9BF0", Proof: "#34d399", Lessons: "#fbbf24",
};
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMoney(n: number) {
  const sym = currencySymbol();
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sym}${(abs / 1000).toFixed(1)}k`;
  return `${sym}${abs.toFixed(0)}`;
}
function fmtViews(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
function isLeap(y: number) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

export default function YearPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<YearStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/year-stats?year=${year}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setData(d); })
      .finally(() => setLoading(false));
  }, [year]);

  const totalDays = year === currentYear
    ? Math.floor((Date.now() - new Date(`${year}-01-01`).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : isLeap(year) ? 366 : 365;

  return (
    <div className="flex flex-col gap-5">
      <div className="animate-fade-up stagger-1 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Year in Review</p>
          <h1 className="text-[28px] font-700 tracking-tight tabular-nums">{year}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear(y => y - 1)}
            className="w-8 h-8 rounded-[10px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all"
            aria-label="Previous year"
          ><ChevronLeft size={14} /></button>
          <span className="text-[12px] text-text-3 px-1 tabular-nums">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            disabled={year >= currentYear}
            className="w-8 h-8 rounded-[10px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next year"
          ><ChevronRight size={14} /></button>
        </div>
      </div>

      {loading || !data ? (
        <>
          <Card><SkeletonRows count={4} /></Card>
          <Card><SkeletonRows count={3} /></Card>
        </>
      ) : (
        <>
          {/* Heatmap */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-accent" />
                <CardTitle>The Year at a Glance</CardTitle>
              </div>
              <Badge variant="muted">{data.log.totalDaysLogged}/{totalDays} logged</Badge>
            </CardHeader>
            <Heatmap year={data.year} daily={data.log.daily} />
            <div className="flex items-center gap-3 mt-3 text-[10px] text-text-3">
              <span>Less</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map(n => (
                  <span key={n} className="w-3 h-3 rounded-[2px]" style={{ background: habitColor(n) }} />
                ))}
              </div>
              <span>More</span>
              <span className="ml-auto">colour = # of habits done · grey = not logged</span>
            </div>
          </Card>

          {/* Peak day */}
          {data.log.bestDay && (
            <Card glow>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Award size={14} className="text-warning" />
                  <CardTitle>Peak Day</CardTitle>
                </div>
                <Badge variant="streak">{data.log.bestDay.date}</Badge>
              </CardHeader>
              <p className="text-[15px] text-text-1">
                <span className="text-warning font-700">{data.log.bestDay.habits}/4 habits</span> · <span className="text-accent font-700 tabular-nums font-mono">{data.log.bestDay.hours}h</span> worked
              </p>
            </Card>
          )}

          {/* Habits */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Flame size={14} className="text-warning" />
                <CardTitle>Habits</CardTitle>
              </div>
            </CardHeader>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <Stat icon={Dumbbell} label="Workouts" value={data.log.workoutDays} streak={data.log.longestStreaks.workout} suffix="days" />
              <Stat icon={Flame}    label="NF"       value={data.log.nfDays}      streak={data.log.longestStreaks.nf}      suffix="days" color="warning" />
              <Stat icon={Eye}      label="Posted"   value={data.log.videoDays}   streak={data.log.longestStreaks.video}   suffix="days" />
              <Stat icon={Clock}    label="Journal"  value={data.log.journalDays} streak={data.log.longestStreaks.journal} suffix="days" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total Hours Worked" value={data.log.totalHours} suffix="hrs" />
              <Stat label="Daily Views Logged" value={fmtViews(data.log.totalViewsLogged)} />
            </div>
          </Card>

          {/* Monthly hours bar chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-accent" />
                <CardTitle>Hours Worked by Month</CardTitle>
              </div>
              <span className="text-[11px] text-text-3 tabular-nums">{data.log.totalHours.toFixed(0)}h total</span>
            </CardHeader>
            <MonthlyBars
              data={data.monthly.map(m => ({ month: m.month, value: m.hours, label: `${m.hours}h` }))}
              barColor="#1D9BF0"
            />
          </Card>

          {/* Monthly publishing */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Video size={14} className="text-accent" />
                <CardTitle>Videos Published by Month</CardTitle>
              </div>
              <span className="text-[11px] text-text-3 tabular-nums">{data.content.published} total</span>
            </CardHeader>
            <StackedMonthlyBars monthly={data.monthly} />
            <div className="flex flex-wrap gap-3 mt-3">
              {(["Journey","Process","Proof","Lessons"] as const).map(p => (
                <div key={p} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: PILLAR_COLOR[p] }} />
                  <span className="text-text-3">{p}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Money */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-success" />
                <CardTitle>Money</CardTitle>
              </div>
              <Badge variant={data.money.net >= 0 ? "success" : "danger"}>
                Net {data.money.net >= 0 ? "+" : "-"}{fmtMoney(data.money.net)}
              </Badge>
            </CardHeader>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="flex flex-col items-start gap-1 px-3 py-3 rounded-[10px] bg-[rgba(52,211,153,0.06)] border border-[rgba(52,211,153,0.18)]">
                <p className="text-[10px] uppercase tracking-widest text-text-3">In</p>
                <p className="text-[22px] font-700 tabular-nums font-mono text-success">{fmtMoney(data.money.income)}</p>
              </div>
              <div className="flex flex-col items-start gap-1 px-3 py-3 rounded-[10px] bg-[rgba(248,113,113,0.06)] border border-[rgba(248,113,113,0.18)]">
                <p className="text-[10px] uppercase tracking-widest text-text-3">Out</p>
                <p className="text-[22px] font-700 tabular-nums font-mono text-danger">{fmtMoney(data.money.expense)}</p>
              </div>
            </div>
            {/* Monthly money bars (income vs expense, paired) */}
            <p className="text-[10px] uppercase tracking-widest text-text-3 mb-2">In vs Out by month</p>
            <MoneyBars monthly={data.monthly} />
            {data.money.topCategories.length > 0 && (
              <>
                <p className="text-[10px] uppercase tracking-widest text-text-3 mb-2 mt-4">Top spend categories</p>
                <div className="flex flex-col gap-1.5">
                  {data.money.topCategories.map((c, i) => {
                    const pct = data.money.expense > 0 ? (c.amount / data.money.expense) * 100 : 0;
                    return (
                      <div key={c.category} className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-text-2">{i + 1}. {c.category}</span>
                          <span className="text-text-1 font-700 tabular-nums">{fmtMoney(c.amount)}</span>
                        </div>
                        <ProgressBar value={pct} color="warning" />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>

          {/* Content by pillar */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Video size={14} className="text-accent" />
                <CardTitle>Content by Pillar</CardTitle>
              </div>
              <Badge variant="muted">{fmtViews(data.content.totalViews)} views</Badge>
            </CardHeader>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat label="Long Form"   value={data.content.longForm} />
              <Stat label="Short Form"  value={data.content.shortForm} />
              <Stat label="Total Views" value={fmtViews(data.content.totalViews)} color="success" />
            </div>
            {data.content.byPillar.some(p => p.count > 0) && (
              <div className="flex flex-col gap-2">
                {data.content.byPillar.filter(p => p.count > 0).map(p => (
                  <div key={p.pillar} className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: PILLAR_COLOR[p.pillar] }} />
                    <span className="flex-1 text-[12px] font-600 text-text-1">{p.pillar}</span>
                    <span className="text-[11px] text-text-3 tabular-nums">{p.count} videos</span>
                    <span className="text-[12px] font-700 tabular-nums text-text-1">{fmtViews(p.views)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Todos */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target size={14} className="text-accent" />
                <CardTitle>Tasks Crushed</CardTitle>
              </div>
              <Badge variant={data.todos.completionRate >= 70 ? "success" : "muted"}>{data.todos.completionRate}%</Badge>
            </CardHeader>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat label="Created" value={data.todos.total} />
              <Stat label="Done"    value={data.todos.done} color="success" />
              <Stat label="Skipped" value={data.todos.total - data.todos.done} color="warning" />
            </div>
            <ProgressBar value={data.todos.completionRate} color={data.todos.completionRate >= 70 ? "success" : "warning"} />
          </Card>

          <p className="text-center text-[10px] text-text-3">
            Aggregated from Notion + Supabase · pulled at view time, no cache
          </p>
        </>
      )}
    </div>
  );
}

// ── Heatmap colors based on habit count (0-4) ────────────────
function habitColor(count: number): string {
  if (count === 0) return "rgba(255,255,255,0.05)";
  if (count === 1) return "rgba(29,155,240,0.20)";
  if (count === 2) return "rgba(29,155,240,0.40)";
  if (count === 3) return "rgba(29,155,240,0.65)";
  return "#1D9BF0"; // all 4
}

// ── Heatmap component ────────────────────────────────────────
function Heatmap({ year, daily }: { year: number; daily: DailyEntry[] }) {
  // Group days into weeks (columns). Week starts Monday.
  const weeks = useMemo(() => {
    if (daily.length === 0) return [];
    const result: (DailyEntry | null)[][] = [];
    let week: (DailyEntry | null)[] = [];
    // Pad start to Monday
    const firstDow = new Date(`${year}-01-01T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    const padStart = (firstDow + 6) % 7; // shift Mon=0
    for (let i = 0; i < padStart; i++) week.push(null);
    for (const d of daily) {
      week.push(d);
      if (week.length === 7) { result.push(week); week = []; }
    }
    while (week.length > 0 && week.length < 7) week.push(null);
    if (week.length === 7) result.push(week);
    return result;
  }, [year, daily]);

  const monthLabels = useMemo(() => {
    // For each week, what month does its Monday fall in? Label only at first appearance.
    const labels: { weekIdx: number; month: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, idx) => {
      const firstDay = w.find(d => d !== null);
      if (firstDay) {
        const m = new Date(firstDay.date + "T00:00:00Z").getUTCMonth();
        if (m !== lastMonth) {
          labels.push({ weekIdx: idx, month: m });
          lastMonth = m;
        }
      }
    });
    return labels;
  }, [weeks]);

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="inline-block min-w-full">
        {/* Month labels */}
        <div className="flex gap-[3px] mb-1 ml-6 relative h-[14px]">
          {weeks.map((_, i) => {
            const label = monthLabels.find(l => l.weekIdx === i);
            return (
              <div key={i} className="w-[11px] text-[9px] text-text-3 absolute" style={{ left: 24 + i * 14 }}>
                {label ? MONTH_NAMES[label.month] : ""}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          {/* Day-of-week labels */}
          <div className="flex flex-col gap-[3px] mr-1.5 text-[9px] text-text-3 leading-[11px] pt-0.5">
            <span className="h-[11px]">Mon</span>
            <span className="h-[11px]" />
            <span className="h-[11px]">Wed</span>
            <span className="h-[11px]" />
            <span className="h-[11px]">Fri</span>
            <span className="h-[11px]" />
            <span className="h-[11px]">Sun</span>
          </div>
          {/* Week columns */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => (
                <div
                  key={di}
                  className="w-[11px] h-[11px] rounded-[2px]"
                  style={{ background: day ? habitColor(day.habitCount) : "transparent" }}
                  title={day ? `${day.date} · ${day.habitCount}/4 habits · ${day.hours}h` : ""}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Monthly bars (single value) ──────────────────────────────
function MonthlyBars({ data, barColor }: { data: { month: number; value: number; label?: string }[]; barColor: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="flex items-end gap-1 h-[100px]">
      {data.map(d => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full rounded-t-[4px] transition-all duration-300"
                style={{
                  height: `${Math.max(pct, d.value > 0 ? 3 : 0)}%`,
                  background: barColor,
                  boxShadow: d.value > 0 ? `0 0 6px ${barColor}40` : "none",
                }}
                title={`${MONTH_NAMES[d.month - 1]} · ${d.label ?? d.value}`}
              />
            </div>
            <span className="text-[9px] text-text-3">{MONTH_NAMES[d.month - 1].slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Monthly stacked bars by pillar (for content) ─────────────
function StackedMonthlyBars({ monthly }: { monthly: MonthlyEntry[] }) {
  const max = Math.max(1, ...monthly.map(m => m.published));
  const pillars = ["Journey", "Process", "Proof", "Lessons"] as const;
  return (
    <div className="flex items-end gap-1 h-[100px]">
      {monthly.map(m => {
        return (
          <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex-1 w-full flex items-end relative">
              <div className="w-full flex flex-col-reverse rounded-t-[4px] overflow-hidden" style={{ height: `${(m.published / max) * 100}%` }}>
                {pillars.map(p => {
                  const count = m.byPillar[p] ?? 0;
                  if (count === 0) return null;
                  const seg = (count / m.published) * 100;
                  return <div key={p} style={{ height: `${seg}%`, background: PILLAR_COLOR[p] }} title={`${p}: ${count}`} />;
                })}
              </div>
            </div>
            <span className="text-[9px] text-text-3">{MONTH_NAMES[m.month - 1].slice(0, 1)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Money paired bars per month (income vs expense) ──────────
function MoneyBars({ monthly }: { monthly: MonthlyEntry[] }) {
  const max = Math.max(1, ...monthly.flatMap(m => [m.income, m.expense]));
  return (
    <div className="flex items-end gap-2 h-[80px]">
      {monthly.map(m => (
        <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
          <div className="flex-1 w-full flex items-end gap-[2px]">
            <div
              className="flex-1 rounded-t-[3px] transition-all duration-300"
              style={{ height: `${(m.income / max) * 100}%`, background: "#34d399", boxShadow: m.income > 0 ? "0 0 4px rgba(52,211,153,0.4)" : "none" }}
              title={`${MONTH_NAMES[m.month - 1]} in · $${m.income.toFixed(0)}`}
            />
            <div
              className="flex-1 rounded-t-[3px] transition-all duration-300"
              style={{ height: `${(m.expense / max) * 100}%`, background: "#f87171", boxShadow: m.expense > 0 ? "0 0 4px rgba(248,113,113,0.4)" : "none" }}
              title={`${MONTH_NAMES[m.month - 1]} out · $${m.expense.toFixed(0)}`}
            />
          </div>
          <span className="text-[9px] text-text-3">{MONTH_NAMES[m.month - 1].slice(0, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function Stat({
  icon: Icon, label, value, suffix, color, streak,
}: {
  icon?: typeof Calendar;
  label: string;
  value: number | string;
  suffix?: string;
  color?: "success" | "warning";
  streak?: number;
}) {
  return (
    <div className="flex flex-col gap-1 px-3 py-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
      {Icon && <Icon size={12} className="text-text-3" />}
      <p className={`text-[20px] font-700 tabular-nums font-mono ${color === "success" ? "text-success" : color === "warning" ? "text-warning" : "text-text-1"}`}>
        {value}{suffix && <span className="text-[11px] text-text-3 font-400 ml-1">{suffix}</span>}
      </p>
      <p className="text-[9px] uppercase tracking-widest text-text-3">{label}</p>
      {streak !== undefined && streak > 0 && (
        <p className="text-[9px] text-warning font-700 inline-flex items-center gap-0.5">
          <Flame size={8} /> Longest streak: {streak}d
        </p>
      )}
    </div>
  );
}
