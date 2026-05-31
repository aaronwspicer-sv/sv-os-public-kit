"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronLeft, ChevronDown, ChevronUp, BookOpen, Flame, Dumbbell, Eye, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface HistoryEntry {
  id: string;
  date: string;
  workout: boolean;
  nf: boolean;
  postedVideo: boolean;
  reflectedJournal: boolean;
  hoursWorked: number;
  dailyViews: number;
  summaryOfDay: string;
  mindsetNotes: string;
}

const HABITS = [
  { key: "workout"          as const, icon: Dumbbell, label: "Workout" },
  { key: "nf"               as const, icon: Flame,    label: "NF" },
  { key: "postedVideo"      as const, icon: Eye,      label: "Video" },
  { key: "reflectedJournal" as const, icon: Clock,    label: "Journal" },
];

function monthKey(date: string): string {
  // YYYY-MM
  return date.slice(0, 7);
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

export default function LogHistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor]   = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load(initial = false) {
    if (initial) setLoading(true); else setLoadingMore(true);
    try {
      const url = new URL("/api/notion/log/history", window.location.origin);
      if (cursor && !initial) url.searchParams.set("cursor", cursor);
      const r = await fetch(url.toString());
      const d = await r.json();
      if (d.entries) {
        setEntries(prev => initial ? d.entries : [...prev, ...d.entries]);
        setCursor(d.nextCursor ?? null);
        setHasMore(!!d.nextCursor);
      }
    } finally {
      if (initial) setLoading(false); else setLoadingMore(false);
    }
  }

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Group by month
  const grouped = entries.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    (acc[monthKey(e.date)] ||= []).push(e);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Daily Log</p>
          <h1 className="text-[24px] font-700 tracking-tight">History</h1>
        </div>
        <Link href="/d/log">
          <Button variant="outline" size="sm"><ChevronLeft size={13} /> Today</Button>
        </Link>
      </div>

      {loading ? (
        <Card><SkeletonRows count={5} /></Card>
      ) : entries.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title="No log entries yet" body="Start journaling to build your history." size="lg" /></Card>
      ) : (
        <div className="flex flex-col gap-6">
          {months.map(m => (
            <section key={m} className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-3 px-1">{monthLabel(m)}</p>
              <div className="flex flex-col gap-2">
                {grouped[m].map(e => {
                  const isOpen = expanded === e.id;
                  const habitCount = HABITS.filter(h => e[h.key]).length;
                  const hasNotes = !!(e.summaryOfDay || e.mindsetNotes);
                  return (
                    <Card key={e.id} className="!p-0 overflow-hidden">
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                      >
                        <div className="flex flex-col items-start flex-shrink-0 w-[100px]">
                          <p className="text-[13px] font-700 text-text-1">{formatDate(e.date)}</p>
                          <p className="text-[10px] text-text-3">{e.date}</p>
                        </div>

                        <div className="flex gap-1.5 flex-1">
                          {HABITS.map(h => {
                            const done = e[h.key];
                            return (
                              <span
                                key={h.key}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-[8px] border text-[10px] font-600 ${
                                  done
                                    ? "bg-[rgba(52,211,153,0.10)] border-[rgba(52,211,153,0.25)] text-success"
                                    : "bg-[rgba(255,255,255,0.02)] border-border-dim text-text-3"
                                }`}
                                title={h.label}
                              >
                                <h.icon size={10} strokeWidth={done ? 2.4 : 2} />
                                {h.label}
                              </span>
                            );
                          })}
                        </div>

                        <div className="hidden sm:flex flex-col items-end gap-0.5 text-right flex-shrink-0">
                          <p className="text-[11px] font-700 tabular-nums font-mono text-text-1">{e.hoursWorked}h</p>
                          <p className="text-[10px] text-text-3 tabular-nums font-mono">{e.dailyViews.toLocaleString()} views</p>
                        </div>

                        <Badge variant={habitCount === HABITS.length ? "success" : "muted"} className="flex-shrink-0">
                          {habitCount}/{HABITS.length}
                        </Badge>

                        {hasNotes && (isOpen ? <ChevronUp size={14} className="text-text-3 flex-shrink-0" /> : <ChevronDown size={14} className="text-text-3 flex-shrink-0" />)}
                      </button>

                      {isOpen && hasNotes && (
                        <div className="px-5 pb-5 pt-1 border-t border-border-dim flex flex-col gap-3">
                          {e.summaryOfDay && (
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">🏁 Summary</p>
                              <p className="text-[13px] text-text-1 leading-relaxed whitespace-pre-wrap">{e.summaryOfDay}</p>
                            </div>
                          )}
                          {e.mindsetNotes && (
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">🧠 Mindset</p>
                              <p className="text-[13px] text-text-1 leading-relaxed whitespace-pre-wrap">{e.mindsetNotes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}

          {hasMore && (
            <Button variant="outline" size="sm" onClick={() => load(false)} loading={loadingMore} className="w-full">
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
