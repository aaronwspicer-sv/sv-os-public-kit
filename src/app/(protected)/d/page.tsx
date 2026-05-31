"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/ToastProvider";
import { config } from "@/config";
import { formatMoney } from "@/lib/money";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/Checkbox";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  BookOpen, Target, DollarSign, Video, Flame, TrendingUp,
  Inbox, ChevronRight, Cloud, CloudRain, Sun, CloudSnow, Trophy,
  Settings as SettingsIcon, Calendar as CalendarIcon, Clock, Menu, LogOut,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────
interface DailyTodo { id: string; text: string; done: boolean; date: string; }
interface BankTx { id: string; merchant_name: string; amount: number; }
interface VideoEntry { id: string; status: string; }
interface Weather { temp: number; code: number; }

function fmtMoney(n: number) {
  // abs preserves prior behavior (net worth shown without sign); currency
  // symbol now follows config (CAD→"$", EUR→"€", …) via formatMoney.
  return formatMoney(Math.abs(n), { decimals: 0 });
}

function getGreeting() {
  const h = new Date().toLocaleString("en-US", { timeZone: config.locale.timezone, hour: "2-digit", hour12: false });
  const hour = parseInt(h);
  if (hour < 6)  return "Still up?";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Night mode";
}

function weatherIcon(code: number) {
  // Simplified WMO code mapping
  if (code === 0 || code === 1) return Sun;
  if (code >= 2 && code <= 3) return Cloud;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 99) return CloudRain;
  return Cloud;
}

export default function HomePage() {
  // Greeting + weather. Owner name from config (was hardcoded "Aaron").
  const firstName = config.owner.name;
  const [weather, setWeather] = useState<Weather | null>(null);
  const toast = useToast();

  // Widgets data
  const [todos, setTodos]               = useState<DailyTodo[] | null>(null);
  const [logEntry, setLogEntry]         = useState<any>(null);
  const [logLoaded, setLogLoaded]       = useState(false);
  const [streaks, setStreaks]           = useState<{ workout: number; video: number; journal: number; nf: number } | null>(null);
  const [netWorth, setNetWorth]         = useState<number | null>(null);
  const [inbox, setInbox]               = useState<BankTx[] | null>(null);
  const [videos, setVideos]             = useState<VideoEntry[] | null>(null);

  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: config.locale.timezone, weekday: "long", month: "long", day: "numeric",
  });

  useEffect(() => {
    // User name
    fetch("/api/auth/totp", { method: "HEAD" }).catch(() => {}); // wake auth
    // Weather — owner's home coords + timezone from config
    const { latitude, longitude } = config.locale.weather;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&temperature_unit=celsius&timezone=${encodeURIComponent(config.locale.timezone)}`)
      .then(r => r.json())
      .then(d => setWeather({ temp: Math.round(d.current?.temperature_2m ?? 0), code: d.current?.weather_code ?? 0 }))
      .catch(() => {});

    // All data in parallel
    fetch("/api/todos").then(r => r.json()).then(d => setTodos([...(d.todayGoals ?? [])])).catch(() => setTodos([]));
    fetch("/api/notion/log").then(r => r.json()).then(d => { setLogEntry(d.entry); setLogLoaded(true); }).catch(() => setLogLoaded(true));
    fetch("/api/notion/streaks").then(r => r.json()).then(d => setStreaks(d.streaks ?? null)).catch(() => setStreaks(null));
    // Net worth via owner-only endpoint (no Finance Vault unlock needed on home page)
    fetch("/api/net-worth").then(r => r.json()).then(d => setNetWorth(d.netWorth ?? 0)).catch(() => setNetWorth(0));
    fetch("/api/bank/transactions").then(r => r.json()).then(d => setInbox((d.transactions ?? []).filter((t: any) => !t.confirmed))).catch(() => setInbox([]));
    fetch("/api/notion/videos").then(r => r.json()).then(d => setVideos(d.videos ?? [])).catch(() => setVideos([]));
  }, []);

  // Log habit toggle (auto-save) — always send the complete entry
  async function toggleHabit(key: "workout" | "nf" | "postedVideo" | "reflectedJournal") {
    // Build a complete entry payload from current state, falling back to defaults for missing fields
    const base = {
      workout: false, nf: false, postedVideo: false, reflectedJournal: false,
      hoursWorked: 0, dailyViews: 0, summaryOfDay: "", mindsetNotes: "",
      ...(logEntry ?? {}),
    };
    const next = { ...base, [key]: !base[key] };
    setLogEntry(next);
    try {
      const r = await fetch("/api/notion/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Save failed");
    } catch (err: any) {
      // Rollback on failure + surface the error so Aaron knows it didn't stick.
      // Previously this was silent — a habit check would visibly toggle but
      // never save to Notion, and he'd find out the next day.
      setLogEntry(base);
      toast.error("Couldn't save habit", err?.message ?? "Notion write failed");
    }
  }

  // Content pipeline counts
  const videoStatusCounts = (videos ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.status] = (acc[v.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalVideos = videos?.length ?? 0;
  const STATUS_COLORS: Record<string, string> = {
    Idea: "#94a3b8", Scripting: "#fbbf24", Filming: "#a78bfa", Editing: "#1D9BF0", Posted: "#34d399",
  };
  const STATUSES = ["Idea", "Scripting", "Filming", "Editing", "Posted"] as const;

  const WeatherIcon = weather ? weatherIcon(weather.code) : Cloud;

  return (
    <div className="flex flex-col gap-5">
      {/* Hero greeting */}
      <div className="animate-fade-up stagger-1 flex items-end justify-between flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-text-3 text-[12px] uppercase tracking-[0.18em] mb-1">{today}</p>
          <h1 className="text-[28px] md:text-[32px] font-700 tracking-tight">
            {getGreeting()}, <span className="text-accent">{firstName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {weather && (
            <div className="glass-1 px-3 py-2 rounded-[12px] flex items-center gap-2">
              <WeatherIcon size={14} className="text-accent" />
              <span className="text-[13px] font-600 tabular-nums">{weather.temp}°C</span>
              <span className="text-[11px] text-text-3 hidden sm:inline">{config.locale.weather.label}</span>
            </div>
          )}
          <MoreMenu />
        </div>
      </div>

      {/* Inbox alert (only shown if items waiting) */}
      {inbox && inbox.length > 0 && (
        <Link href="/d/finances" className="animate-fade-up stagger-2 block">
          <Card variant="warning" interactive className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[12px] bg-[rgba(251,191,36,0.14)] border border-[rgba(251,191,36,0.28)] flex items-center justify-center flex-shrink-0">
              <Inbox size={16} className="text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-600 text-text-1">{inbox.length} transaction{inbox.length === 1 ? "" : "s"} to review</p>
              <p className="text-[11px] text-text-3 truncate">Latest: {inbox[0]?.merchant_name ?? "—"}</p>
            </div>
            <ChevronRight size={16} className="text-text-3" />
          </Card>
        </Link>
      )}

      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-up stagger-3">

        {/* Net Worth */}
        <Link href="/d/finances">
          <Card interactive className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-accent" />
                <CardTitle>Net Worth</CardTitle>
              </div>
              <ChevronRight size={14} className="text-text-3" />
            </CardHeader>
            {netWorth === null ? (
              <Skeleton width="60%" height={32} />
            ) : (
              <>
                <p className="text-[26px] font-700 tabular-nums">{fmtMoney(netWorth)}</p>
                <p className="text-[11px] text-text-3 mt-1">Bank + assets · tap for details</p>
              </>
            )}
          </Card>
        </Link>

        {/* Today's Tasks */}
        <Link href="/d/goals">
          <Card interactive className="h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target size={14} className="text-accent" />
                <CardTitle>Today's Tasks</CardTitle>
              </div>
              <ChevronRight size={14} className="text-text-3" />
            </CardHeader>
            {todos === null ? (
              <SkeletonRows count={3} />
            ) : todos.length === 0 ? (
              <EmptyState title="Nothing planned" body="Add tasks in Goals." size="sm" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {todos.slice(0, 3).map(t => (
                  <div key={t.id} className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.done ? "bg-success" : "bg-accent"}`} />
                    <span className={`text-[13px] truncate ${t.done ? "line-through text-text-3" : "text-text-1"}`}>{t.text}</span>
                  </div>
                ))}
                {todos.length > 3 && (
                  <p className="text-[11px] text-text-3 mt-1">+ {todos.length - 3} more</p>
                )}
                <Badge variant={todos.every(t => t.done) ? "success" : "muted"} className="self-start mt-2">
                  {todos.filter(t => t.done).length}/{todos.length} done
                </Badge>
              </div>
            )}
          </Card>
        </Link>

        {/* Today's Log */}
        <Card>
          <CardHeader>
            <Link href="/d/log" className="flex items-center gap-2 hover:text-accent transition-colors">
              <BookOpen size={14} className="text-accent" />
              <CardTitle>Today's Log</CardTitle>
            </Link>
            <Link href="/d/log"><ChevronRight size={14} className="text-text-3 hover:text-accent" /></Link>
          </CardHeader>
          {!logLoaded ? (
            <SkeletonRows count={4} />
          ) : (
            <div className="flex flex-col gap-2.5">
              {[
                { key: "workout"          as const, label: "Workout" },
                { key: "nf"               as const, label: "NF" },
                { key: "postedVideo"      as const, label: "Posted Video" },
                { key: "reflectedJournal" as const, label: "Journal" },
              ].map(h => (
                <Checkbox
                  key={h.key}
                  checked={!!logEntry?.[h.key]}
                  onChange={() => toggleHabit(h.key)}
                  label={h.label}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Streaks */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-warning" />
              <CardTitle>Streaks</CardTitle>
            </div>
          </CardHeader>
          {!streaks ? (
            <div className="flex justify-around"><Skeleton width={40} height={36} /><Skeleton width={40} height={36} /><Skeleton width={40} height={36} /><Skeleton width={40} height={36} /></div>
          ) : (
            <div className="flex justify-around">
              {[
                { k: "workout", l: "Workout" },
                { k: "video",   l: "Video" },
                { k: "journal", l: "Journal" },
                { k: "nf",      l: "NF" },
              ].map(s => {
                const count = streaks[s.k as keyof typeof streaks];
                return (
                  <div key={s.k} className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1">
                      <Flame size={12} className={count > 0 ? "text-warning" : "text-text-3"} />
                      <span className={`text-[18px] font-700 tabular-nums ${count > 0 ? "text-warning" : "text-text-3"}`}>{count}</span>
                    </div>
                    <span className="text-[9px] uppercase tracking-widest text-text-3">{s.l}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Jays widget — gated; personal/Toronto feature */}
        {config.features.jays && <JaysWidget />}

        {/* Content Pipeline */}
        <Link href="/d/content" className="md:col-span-2">
          <Card interactive>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Video size={14} className="text-accent" />
                <CardTitle>Content Pipeline</CardTitle>
              </div>
              {videos !== null && <Badge variant="muted">{totalVideos} total</Badge>}
            </CardHeader>
            {videos === null ? (
              <Skeleton width="100%" height={24} />
            ) : totalVideos === 0 ? (
              <EmptyState title="No videos in pipeline" body="Add to your Notion SV Videos DB." size="sm" />
            ) : (
              <>
                {/* Stacked bar */}
                <div className="flex h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,0.04)]">
                  {STATUSES.map(s => {
                    const count = videoStatusCounts[s] ?? 0;
                    const pct = totalVideos > 0 ? (count / totalVideos) * 100 : 0;
                    return (
                      <div
                        key={s}
                        style={{
                          width: `${pct}%`,
                          background: STATUS_COLORS[s],
                          boxShadow: count > 0 ? `0 0 6px ${STATUS_COLORS[s]}80` : "none",
                        }}
                        className="transition-all duration-500"
                      />
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-3">
                  {STATUSES.map(s => {
                    const count = videoStatusCounts[s] ?? 0;
                    if (count === 0) return null;
                    return (
                      <div key={s} className="flex items-center gap-1.5 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS[s] }} />
                        <span className="text-text-2">{s}</span>
                        <span className="text-text-1 font-700 tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </Link>
      </div>

      {/* Cmd+K hint */}
      <p className="text-center text-[11px] text-text-3 mt-2">
        Press <kbd className="px-1.5 py-0.5 rounded-[6px] bg-[rgba(255,255,255,0.06)] border border-border-dim text-text-2 font-mono text-[10px]">⌘K</kbd> to quick-add
      </p>
    </div>
  );
}

// ── Mobile-friendly "More" menu (sidebar overflow for phones) ─
function MoreMenu() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items = [
    { href: "/d/settings",    icon: SettingsIcon, label: "Settings" },
    { href: "/d/calendar",    icon: CalendarIcon, label: "Calendar" },
    { href: "/d/timeline",    icon: Clock,        label: "Timeline" },
    ...(config.features.jays ? [{ href: "/d/jays", icon: Trophy, label: "Blue Jays" }] : []),
    { href: "/d/year",        icon: TrendingUp,   label: "Year stats" },
    { href: "/d/log/history", icon: BookOpen,     label: "Log history" },
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="More options"
        className="w-10 h-10 rounded-[12px] glass-1 inline-flex items-center justify-center text-text-2 hover:text-accent hover:border-[rgba(29,155,240,0.32)] transition-all"
      >
        <Menu size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-end pt-4 pr-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ animation: "fade-in 0.18s var(--ease-glide) both" }}
        >
          <div
            className="glass-3 w-full max-w-[260px] rounded-[16px] p-2 flex flex-col gap-0.5"
            style={{ animation: "scale-in 0.22s var(--ease-spring) both" }}
          >
            {items.map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-600 text-text-2 hover:bg-[rgba(255,255,255,0.05)] hover:text-text-1 transition-all"
              >
                <Icon size={14} className="text-text-3" />
                {label}
              </Link>
            ))}
            <div className="h-px bg-border-dim my-1" />
            <button
              onClick={async () => {
                try { sessionStorage.removeItem("spicer_booted"); } catch {}
                try { sessionStorage.removeItem("spicer_os_pin_unlocked"); } catch {}
                await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
                window.location.href = "/login";
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-600 text-text-3 hover:bg-[rgba(248,113,113,0.08)] hover:text-danger transition-all w-full text-left"
            >
              <LogOut size={14} className="text-text-3" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Jays mini widget ──────────────────────────────────────────
function JaysWidget() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/jays").then(r => r.json()).then(d => { if (d && !d.error) setData(d); }).catch(() => {});
  }, []);

  return (
    <Link href="/d/jays">
      <Card interactive className="h-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trophy size={14} style={{ color: "#134A8E" }} />
            <CardTitle>Blue Jays</CardTitle>
            {data?.liveGame && (
              <span className="inline-flex items-center gap-1 text-[9px] font-700 text-danger uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-danger animate-led" /> Live
              </span>
            )}
          </div>
          <ChevronRight size={14} className="text-text-3" />
        </CardHeader>
        {!data ? (
          <Skeleton width="80%" height={32} />
        ) : data.liveGame ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[18px] font-700 tabular-nums font-mono">
                <span className="text-text-1">TOR {data.liveGame.jaysScore ?? 0}</span>
                <span className="text-text-3"> · </span>
                <span className="text-text-1">{data.liveGame.opponentAbbr} {data.liveGame.opponentScore ?? 0}</span>
              </p>
              <p className="text-[11px] text-text-3 mt-0.5">{data.liveGame.inningState ?? ""} {data.liveGame.inning ?? ""}</p>
            </div>
          </div>
        ) : data.nextGame ? (
          <div>
            <p className="text-[13px] font-600 text-text-1">{data.nextGame.isHome ? "vs " : "@ "}{data.nextGame.opponentAbbr}</p>
            <p className="text-[11px] text-text-3 mt-0.5">
              {new Date(data.nextGame.date).toLocaleString("en-CA", { timeZone: config.locale.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
            {data.record && (
              <p className="text-[10px] text-text-3 mt-2">
                {data.record.wins}-{data.record.losses}
                {data.divisionRank && ` · #${data.divisionRank} AL East`}
                {data.streak && ` · ${data.streak}`}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-text-3">Season offline</p>
        )}
      </Card>
    </Link>
  );
}
