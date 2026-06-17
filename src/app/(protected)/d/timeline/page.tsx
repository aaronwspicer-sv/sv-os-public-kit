"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StationHeader } from "@/components/ui/StationHeader";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ChevronLeft, ChevronRight, BookOpen, Video, DollarSign, Award, Image as ImageIcon,
  Target, BarChart3, Clock, ExternalLink, X, MapPin, List, Map as MapIcon,
} from "lucide-react";
import { MapView } from "@/components/timeline/MapView";
import { config } from "@/config";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { DEMO_TIMELINE_TITLE, DEMO_TIMELINE_BODY, DEMO_TIMELINE_PLACE } from "@/lib/demoMode";

// ── Types ────────────────────────────────────────────────────
type EventType = "journal" | "video" | "money" | "milestone" | "photo" | "goal";

interface TimelineEvent {
  id: string;
  date: string;
  datetime: string;
  type: EventType;
  title: string;
  body?: string;
  thumbnail?: string;
  link?: string;
  meta?: Record<string, any>;
}

interface EventsResponse {
  year: number;
  events: TimelineEvent[];
  counts: Record<string, number>;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_META: Record<EventType, { icon: typeof BookOpen; color: string; label: string }> = {
  journal:   { icon: BookOpen,    color: "#1D9BF0",  label: "Journal" },
  video:     { icon: Video,       color: "#a78bfa",  label: "Video" },
  money:     { icon: DollarSign,  color: "#34d399",  label: "Money" },
  milestone: { icon: Award,       color: "#fbbf24",  label: "Milestone" },
  photo:     { icon: ImageIcon,   color: "#f472b6",  label: "Photo" },
  goal:      { icon: Target,      color: "#fb923c",  label: "Goal" },
};

const FILTER_CHIPS: { key: EventType | "all"; label: string }[] = [
  { key: "all",        label: "All" },
  { key: "journal",    label: "Journal" },
  { key: "video",      label: "Videos" },
  { key: "money",      label: "Money" },
  { key: "photo",      label: "Photos" },
  { key: "milestone",  label: "Milestones" },
  { key: "goal",       label: "Goals" },
];

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: config.locale.timezone, weekday: "short", month: "short", day: "numeric",
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-CA", { timeZone: config.locale.timezone, hour: "numeric", minute: "2-digit" });
}

// ── Page ─────────────────────────────────────────────────────
export default function TimelinePage() {
  const { isDemoMode } = useDemoMode();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [view, setView] = useState<"feed" | "map">("feed");
  const [open, setOpen] = useState<TimelineEvent | null>(null);

  // Refs to each month section for the scroll rail
  const monthRefs = useRef<Record<number, HTMLElement | null>>({});
  const [activeMonth, setActiveMonth] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/timeline/events?year=${year}`)
      .then(r => r.json())
      .then(d => { if (d && !d.error) setData(d); })
      .finally(() => setLoading(false));
  }, [year]);

  // Filtered + grouped by month
  const grouped = useMemo(() => {
    const events = (data?.events ?? []).filter(e => filter === "all" || e.type === filter);
    const byMonth: Record<number, TimelineEvent[]> = {};
    for (const e of events) {
      const m = new Date(e.datetime).getUTCMonth(); // datetime is ISO UTC; for Toronto display we already showed date as label
      // Use Toronto month
      const tMonth = parseInt(new Date(e.datetime).toLocaleDateString("en-CA", { timeZone: config.locale.timezone, month: "numeric" }), 10) - 1;
      void m;
      (byMonth[tMonth] ||= []).push(e);
    }
    return byMonth;
  }, [data, filter]);

  const monthsWithEvents = useMemo(() => {
    return Object.keys(grouped).map(Number).sort((a, b) => b - a);
  }, [grouped]);

  // Observe month sections for active highlighting in the rail
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const m = parseInt((visible[0].target as HTMLElement).dataset.month ?? "0", 10);
          setActiveMonth(m);
        }
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.5, 1] }
    );
    Object.values(monthRefs.current).forEach(el => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [monthsWithEvents]);

  function jumpToMonth(m: number) {
    monthRefs.current[m]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <StationHeader
        station="TIMELINE"
        title={<span className="tabular-nums">{year}</span>}
        action={
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/d/year"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-border-dim text-[11px] font-600 text-text-3 hover:border-accent hover:text-accent transition-all"
          >
            <BarChart3 size={11} /> Year stats →
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setYear(y => y - 1)}
              className="w-8 h-8 rounded-[10px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all"
              aria-label="Previous year"
            ><ChevronLeft size={14} /></button>
            <span className="text-[12px] text-text-3 px-2 tabular-nums">{year}</span>
            <button
              onClick={() => setYear(y => y + 1)}
              disabled={year >= currentYear}
              className="w-8 h-8 rounded-[10px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next year"
            ><ChevronRight size={14} /></button>
          </div>
        </div>
        }
      />

      {/* Feed / Map toggle */}
      <div className="animate-fade-up stagger-2 flex gap-1 p-1 bg-surface-2 rounded-[10px] self-start">
        {[
          { key: "feed" as const, label: "Feed", icon: List },
          { key: "map"  as const, label: "Map",  icon: MapIcon },
        ].map(v => {
          const Icon = v.icon;
          const active = view === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[11px] font-600 transition-all ${
                active ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
              }`}
            >
              <Icon size={12} /> {v.label}
            </button>
          );
        })}
      </div>

      {/* Map view — hidden in demo (real photo GPS locations) */}
      {view === "map" && (isDemoMode ? (
        <div className="glass-1 rounded-[16px] border border-border-dim p-8 text-center">
          <p className="text-[13px] text-text-3">🗺️ Your travels map out here from your photo locations — hidden in demo to keep your real places private.</p>
        </div>
      ) : <MapView year={year} />)}

      {/* Filter chips — feed only */}
      {view === "feed" && <div className="animate-fade-up stagger-2 flex flex-wrap gap-2">
        {FILTER_CHIPS.map(c => {
          const active = filter === c.key;
          const count = c.key === "all" ? (data?.events.length ?? 0) : (data?.counts?.[c.key] ?? 0);
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-600 uppercase tracking-wide border transition-all ${
                active
                  ? "bg-accent-dim border-[rgba(29,155,240,0.32)] text-accent"
                  : "border-border-dim text-text-3 hover:border-border hover:text-text-2"
              }`}
            >
              {c.label}
              {!loading && count > 0 && <span className={`tabular-nums ${active ? "text-accent" : "text-text-3"}`}>{count}</span>}
            </button>
          );
        })}
      </div>}

      {view === "feed" && <div className="relative flex gap-5">
        {/* Main timeline column */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <Card className="flex flex-col gap-3">
              <Skeleton height={60} />
              <Skeleton height={60} />
              <Skeleton height={60} />
            </Card>
          ) : !data || data.events.length === 0 ? (
            <Card>
              <EmptyState
                icon={Clock}
                title="No timeline events yet"
                body="As you log days, ship videos, and add photos, they'll appear here in chronological order."
                size="lg"
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-8">
              {monthsWithEvents.map(m => {
                const events = grouped[m];
                if (!events?.length) return null;
                return (
                  <section
                    key={m}
                    ref={(el) => { monthRefs.current[m] = el; }}
                    data-month={m}
                    className="flex flex-col gap-3 scroll-mt-4"
                  >
                    <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-canvas/85 backdrop-blur-md flex items-center gap-3">
                      <h2 className="text-[16px] font-700 tracking-tight text-text-1">{MONTH_FULL[m]}</h2>
                      <Badge variant="muted">{events.length}</Badge>
                      <div className="flex-1 h-px bg-border-dim" />
                    </div>
                    <ol className="relative flex flex-col gap-3 pl-6">
                      {/* Vertical timeline line */}
                      <span aria-hidden className="absolute left-[9px] top-1 bottom-1 w-px bg-border-dim" />
                      {events.map(ev => (
                        <TimelineCard key={ev.id} ev={ev} onOpen={() => setOpen(ev)} />
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Month rail (desktop only) */}
        {data && monthsWithEvents.length > 0 && (
          <aside className="hidden lg:flex flex-col gap-1 sticky top-6 self-start w-[60px] flex-shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-text-3 px-1 mb-1">Jump</p>
            {MONTH_NAMES.map((name, i) => {
              const has = (grouped[i]?.length ?? 0) > 0;
              const active = activeMonth === i;
              return (
                <button
                  key={i}
                  onClick={() => has && jumpToMonth(i)}
                  disabled={!has}
                  className={`text-left px-2 py-1 rounded-[6px] text-[10px] font-600 transition-all ${
                    !has ? "text-text-3 opacity-40 cursor-default" :
                    active ? "bg-accent-dim text-accent" : "text-text-2 hover:bg-[rgba(255,255,255,0.04)] hover:text-text-1"
                  }`}
                >
                  {name}
                  {has && <span className="tabular-nums text-text-3 ml-1 text-[9px]">{grouped[i].length}</span>}
                </button>
              );
            })}
          </aside>
        )}
      </div>}

      {/* Detail modal */}
      {open && <DetailModal ev={open} onClose={() => setOpen(null)} />}

      {/* Footer hint about photos */}
      {data && data.counts?.photo === 0 && data.events.length > 0 && (
        <div className="glass-1 rounded-[12px] p-4 text-center">
          <p className="text-[11px] text-text-3">
            📸 No photos yet — connect your iCloud library via the macOS/iOS Shortcut to weave photos into your timeline.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Single timeline card ─────────────────────────────────────
function TimelineCard({ ev, onOpen }: { ev: TimelineEvent; onOpen: () => void }) {
  const { isDemoMode } = useDemoMode();
  const meta = TYPE_META[ev.type];
  const Icon = meta.icon;

  return (
    <li className="relative">
      {/* Dot on the line */}
      <span
        aria-hidden
        className="absolute -left-[20px] top-3 w-3 h-3 rounded-full"
        style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}80`, border: "2px solid #000" }}
      />
      <button
        onClick={onOpen}
        className="w-full text-left glass-1 rounded-[12px] p-3 hover:border-[rgba(29,155,240,0.28)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-200 ease-[var(--ease-glide)]"
      >
        <div className="flex items-start gap-3">
          {ev.thumbnail ? (
            <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 bg-[rgba(255,255,255,0.03)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ev.thumbnail} alt="" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}40` }}
            >
              <Icon size={14} style={{ color: meta.color }} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[10px] uppercase tracking-widest text-text-3">{formatLongDate(ev.datetime)}</p>
              <span className="text-[9px] uppercase tracking-widest" style={{ color: meta.color }}>{meta.label}</span>
            </div>
            <p className="text-[13px] font-600 text-text-1 truncate">{isDemoMode ? DEMO_TIMELINE_TITLE : ev.title}</p>
            {(isDemoMode || ev.body) && <p className="text-[11px] text-text-3 mt-0.5 line-clamp-2">{isDemoMode ? DEMO_TIMELINE_BODY : ev.body}</p>}
          </div>
        </div>
      </button>
    </li>
  );
}

// ── Detail modal ─────────────────────────────────────────────
function DetailModal({ ev, onClose }: { ev: TimelineEvent; onClose: () => void }) {
  const { isDemoMode } = useDemoMode();
  const meta = TYPE_META[ev.type];
  const Icon = meta.icon;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4 bg-black/60 backdrop-blur-md"
      style={{ animation: "fade-in 0.2s var(--ease-glide) both" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-3 w-full max-w-[480px] rounded-[20px] overflow-hidden"
        style={{ animation: "scale-in 0.24s var(--ease-spring) both" }}
      >
        {ev.thumbnail && (
          <div className="aspect-video bg-[rgba(255,255,255,0.03)] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ev.thumbnail} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: `${meta.color}1a`, border: `1px solid ${meta.color}40` }}
            >
              <Icon size={16} style={{ color: meta.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] uppercase tracking-widest text-text-3">{formatLongDate(ev.datetime)} · {formatTime(ev.datetime)}</p>
              </div>
              <p className="text-[15px] font-700 text-text-1 mt-0.5">{isDemoMode ? DEMO_TIMELINE_TITLE : ev.title}</p>
            </div>
            <button onClick={onClose} className="text-text-3 hover:text-text-1 transition-colors p-1 -mr-1" aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {(isDemoMode || ev.body) && (
            <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{isDemoMode ? DEMO_TIMELINE_BODY : ev.body}</p>
          )}

          {/* Type-specific meta */}
          {ev.type === "journal" && ev.meta?.habits && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {[
                { key: "workout", emoji: "💪", label: "Workout" },
                { key: "nf", emoji: "🔥", label: "NF" },
                { key: "postedVideo", emoji: "📹", label: "Video" },
                { key: "reflectedJournal", emoji: "✍️", label: "Journal" },
              ].filter(h => ev.meta!.habits[h.key]).map(h => (
                <Badge key={h.key} variant="success">{h.emoji} {h.label}</Badge>
              ))}
              {typeof ev.meta.hours === "number" && ev.meta.hours > 0 && (
                <Badge variant="accent">⏱ {isDemoMode ? "7.5" : ev.meta.hours}h</Badge>
              )}
            </div>
          )}

          {ev.type === "photo" && ev.meta?.place && (
            <p className="text-[11px] text-text-3 inline-flex items-center gap-1">
              <MapPin size={11} /> {isDemoMode ? DEMO_TIMELINE_PLACE : ev.meta.place}
            </p>
          )}

          {ev.link && (
            <a
              href={ev.link}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline self-start"
            >
              Open in Notion <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
