"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Calendar, LayoutGrid, List, CheckSquare, Video, BookOpen, ChevronRight, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { config } from "@/config";

// ── Google Calendar embed config ──────────────────────────────
// Base64 calendar IDs from your Google Calendar embed URL (6 calendars)
const CAL_SRCS = [
  "YWFyb253c3BpY2VyQHNwaWNlcnZpc2lvbnMub25saW5l",
  "ZW4tZ2IuY2FuYWRpYW4jaG9saWRheUBncm91cC52LmNhbGVuZGFyLmdvb2dsZS5jb20",
  "YXNwaWNlckBodWRzb25jb2xsZWdlLmNh",
  "aHVkc29uY29sbGVnZS5jYV9vbjJ2NWg2MmFibXB1YnRxaHU1ZnVyZ2Fkc0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t",
  "aHVkc29uY29sbGVnZS5jYV92ajNqNm80Z2NvYWowdGpmdmQyc29nNjhwNEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t",
  "dGhlbmV3YXdzMjAyMEBnbWFpbC5jb20",
] as const;
const COLORS = [
  "%23039be5", "%230b8043", "%23f4511e", "%23c0ca33", "%23c0ca33", "%23009688",
] as const;

const VIEWS = [
  { key: "WEEK",   label: "Week",   icon: Calendar },
  { key: "MONTH",  label: "Month",  icon: LayoutGrid },
  { key: "AGENDA", label: "Agenda", icon: List },
] as const;

function buildEmbedUrl(mode: typeof VIEWS[number]["key"]): string {
  const base = "https://calendar.google.com/calendar/embed";
  const flags = [
    "wkst=1",
    `ctz=${encodeURIComponent(config.locale.timezone)}`,
    "bgcolor=%23000000",
    "showPrint=0",
    "showTabs=1",
    "showCalendars=1",
    "showTz=0",
    `mode=${mode}`,
  ];
  const srcs   = CAL_SRCS.map(s => `src=${s}`);
  const colors = COLORS.map(c => `color=${c}`);
  return `${base}?${[...flags, ...srcs, ...colors].join("&")}`;
}

// ── Types ─────────────────────────────────────────────────────
interface Todo { id: string; text: string; done: boolean; date: string; }
interface PublishedItem { id: string; title: string; pillar: string; status: string; publishDate: string; type: string; }
interface LogEntry { workout: boolean; nf: boolean; postedVideo: boolean; reflectedJournal: boolean; hoursWorked: number; }

const PILLAR_COLOR: Record<string, string> = {
  Journey: "#a78bfa", Process: "#1D9BF0", Proof: "#34d399", Lessons: "#fbbf24",
};

// ── Page ─────────────────────────────────────────────────────
export default function CalendarPage() {
  const [mode, setMode] = useState<typeof VIEWS[number]["key"]>("WEEK");
  const [iframeExpanded, setIframeExpanded] = useState(false);

  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [content, setContent] = useState<PublishedItem[] | null>(null);
  const [events, setEvents] = useState<CalEventLite[] | null>(null);
  const [log, setLog] = useState<LogEntry | null>(null);
  const [logLoaded, setLogLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/todos").then(r => r.json()).then(d => setTodos([...(d.todayGoals ?? []), ...(d.tomorrowGoals ?? [])])).catch(() => setTodos([]));
    fetch("/api/notion/videos").then(r => r.json()).then(d => setContent(d.videos ?? [])).catch(() => setContent([]));
    fetch("/api/calendar/events?days=3").then(r => r.json()).then(d => setEvents(d.events ?? [])).catch(() => setEvents([]));
    fetch("/api/notion/log").then(r => r.json()).then(d => { setLog(d.entry); setLogLoaded(true); }).catch(() => setLogLoaded(true));
  }, []);

  // Build today + tomorrow window in Toronto
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-CA", { timeZone: config.locale.timezone });

  const todayItems = useMemo(() => buildAgenda(todos, content, events, todayStr), [todos, content, events, todayStr]);
  const tomorrowItems = useMemo(() => buildAgenda(todos, content, events, tomorrowStr), [todos, content, events, tomorrowStr]);

  const todayLabel = new Date(`${todayStr}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });
  const tomorrowLabel = new Date(`${tomorrowStr}T12:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="animate-fade-up stagger-1 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Calendar</p>
          <h1 className="text-[24px] font-700 tracking-tight">Schedule</h1>
        </div>

        {/* View toggle (only relevant when iframe is visible) */}
        <div className="flex gap-1 p-1 bg-surface-2 rounded-[10px]">
          {VIEWS.map(v => {
            const Icon = v.icon;
            return (
              <button
                key={v.key}
                onClick={() => setMode(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[11px] font-600 transition-all ${
                  mode === v.key ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
                }`}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda strip (hidden when iframe is expanded) */}
      {!iframeExpanded && (
        <div className="animate-fade-up stagger-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <AgendaCard
            label="Today"
            dateLabel={todayLabel}
            items={todayItems}
            loading={!todos || !content || !events}
            isToday
            log={log}
            logLoaded={logLoaded}
          />
          <AgendaCard
            label="Tomorrow"
            dateLabel={tomorrowLabel}
            items={tomorrowItems}
            loading={!todos || !content || !events}
          />
        </div>
      )}

      {/* Iframe — expandable */}
      <div className="animate-fade-up stagger-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-3 flex items-center gap-2">
            <Calendar size={11} /> Google Calendar
          </p>
          <button
            onClick={() => setIframeExpanded(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-text-3 hover:text-accent transition-colors"
          >
            {iframeExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
            {iframeExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
        <div className="glass overflow-hidden rounded-[16px]">
          <iframe
            key={mode}
            src={buildEmbedUrl(mode)}
            className="w-full block"
            style={{
              border: "none",
              height: iframeExpanded ? "calc(100vh - 160px)" : "560px",
              minHeight: "480px",
            }}
            title="Google Calendar"
          />
        </div>
      </div>
    </div>
  );
}

// ── Agenda construction ──────────────────────────────────────
interface CalEventLite {
  title: string;
  start: string;
  end:   string;
  allDay: boolean;
  source?: string | null;
  location?: string | null;
}

type AgendaItem =
  | { kind: "task"; id: string; text: string; done: boolean; }
  | { kind: "publish"; id: string; title: string; pillar: string; type: string; status: string; }
  | { kind: "event"; id: string; title: string; start: string; allDay: boolean; source?: string | null; location?: string | null; sortKey: number; };

function buildAgenda(
  todos: Todo[] | null,
  videos: PublishedItem[] | null,
  events: CalEventLite[] | null,
  dateStr: string,
): AgendaItem[] {
  const items: AgendaItem[] = [];
  // Real Google Calendar events (filtered to dateStr in Toronto)
  for (const e of events ?? []) {
    const day = new Date(e.start).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    if (day !== dateStr) continue;
    items.push({
      kind: "event",
      id: `${e.start}|${e.title}`,
      title: e.title,
      start: e.start,
      allDay: e.allDay,
      source: e.source ?? null,
      location: e.location ?? null,
      sortKey: e.allDay ? 0 : new Date(e.start).getTime(),
    });
  }
  for (const t of todos ?? []) {
    if (t.date === dateStr) {
      items.push({ kind: "task", id: t.id, text: t.text, done: t.done });
    }
  }
  for (const v of videos ?? []) {
    if (v.publishDate?.startsWith(dateStr)) {
      items.push({ kind: "publish", id: v.id, title: v.title, pillar: v.pillar, type: v.type, status: v.status });
    }
  }
  // Sort: events first (by time), then tasks, then publishes
  return items.sort((a, b) => {
    const order = (it: AgendaItem) => it.kind === "event" ? 0 : it.kind === "task" ? 1 : 2;
    if (order(a) !== order(b)) return order(a) - order(b);
    if (a.kind === "event" && b.kind === "event") return a.sortKey - b.sortKey;
    return 0;
  });
}

// ── Agenda card ──────────────────────────────────────────────
function AgendaCard({
  label, dateLabel, items, loading, isToday, log, logLoaded,
}: {
  label: string;
  dateLabel: string;
  items: AgendaItem[];
  loading: boolean;
  isToday?: boolean;
  log?: LogEntry | null;
  logLoaded?: boolean;
}) {
  const eventCount   = items.filter(i => i.kind === "event").length;
  const taskCount    = items.filter(i => i.kind === "task").length;
  const publishCount = items.filter(i => i.kind === "publish").length;
  const tasksDone    = items.filter(i => i.kind === "task" && i.done).length;

  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <div>
          <CardTitle>{label}</CardTitle>
          <p className="text-[12px] text-text-2 mt-0.5">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          {eventCount > 0   && <Badge variant="accent">{eventCount} {eventCount === 1 ? "event" : "events"}</Badge>}
          {taskCount > 0    && <Badge variant={tasksDone === taskCount ? "success" : "muted"}>{tasksDone}/{taskCount} tasks</Badge>}
          {publishCount > 0 && <Badge variant="accent">{publishCount} publish</Badge>}
        </div>
      </CardHeader>

      {/* Today's log status mini-row (only for today card) */}
      {isToday && logLoaded && (
        <Link href="/d/log" className="-mx-1">
          <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim hover:border-[rgba(29,155,240,0.25)] transition-all">
            <BookOpen size={13} className="text-accent flex-shrink-0" />
            <span className="text-[11px] text-text-2 flex-1">
              {log
                ? `Today's log · ${[log.workout && "💪", log.nf && "🔥", log.postedVideo && "📹", log.reflectedJournal && "✍️"].filter(Boolean).join(" ") || "no habits checked yet"}`
                : "No log entry yet — tap to start"}
            </span>
            <ChevronRight size={11} className="text-text-3" />
          </div>
        </Link>
      )}

      {/* Agenda list */}
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={isToday ? "Nothing scheduled" : "Free day"}
          body={isToday ? "Add a task or schedule a video to fill this in." : "Plan something for tomorrow."}
          size="sm"
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map(item => <AgendaRow key={`${item.kind}-${item.id}`} item={item} />)}
        </div>
      )}
    </Card>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  if (item.kind === "event") {
    const when = item.allDay
      ? "All-day"
      : new Date(item.start).toLocaleTimeString("en-US", { timeZone: config.locale.timezone, hour: "numeric", minute: "2-digit" });
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-[rgba(167,139,250,0.06)] border border-[rgba(167,139,250,0.22)]">
        <Calendar size={12} className="text-[#a78bfa]" />
        <span className="text-[10px] font-mono text-[#a78bfa] tabular-nums w-14">{when}</span>
        <span className="flex-1 text-[12px] text-text-1 truncate">{item.title}</span>
        {item.source && <span className="text-[9px] uppercase tracking-widest text-text-3 truncate max-w-[80px]">{item.source}</span>}
      </div>
    );
  }
  if (item.kind === "task") {
    return (
      <Link href="/d/goals" className="-mx-1">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim hover:border-[rgba(29,155,240,0.25)] transition-all">
          <CheckSquare size={12} className={item.done ? "text-success" : "text-accent"} />
          <span className={`flex-1 text-[12px] truncate ${item.done ? "line-through text-text-3" : "text-text-1"}`}>
            {item.text}
          </span>
          <span className="text-[9px] uppercase tracking-widest text-text-3">Task</span>
        </div>
      </Link>
    );
  }
  return (
    <Link href="/d/content" className="-mx-1">
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim hover:border-[rgba(29,155,240,0.25)] transition-all">
        <Video size={12} style={{ color: PILLAR_COLOR[item.pillar] ?? "#94a3b8" }} />
        <span className="flex-1 text-[12px] text-text-1 truncate">{item.title}</span>
        <span className="text-[9px] uppercase tracking-widest text-text-3">{item.status}</span>
      </div>
    </Link>
  );
}
