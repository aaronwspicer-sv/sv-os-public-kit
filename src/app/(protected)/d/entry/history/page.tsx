"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronLeft, ChevronDown, ChevronUp, BookOpen, Flame, Dumbbell, Eye, Clock, Search, Tag } from "lucide-react";
import { useDemoMode } from "@/components/ui/DemoModeContext";

interface HistoryEntry {
  id: string; date: string;
  workout: boolean; nf: boolean; postedVideo: boolean; reflectedJournal: boolean;
  hoursWorked: number; dailyViews: number; summaryOfDay: string; mindsetNotes: string;
  // enriched from journal_entries
  journalTitle?: string; journalBody?: string; mood?: number | null; tags?: string[];
}

const MOODS = ["","😞","😐","🙂","😊","🤩"] as const;
const DEMO_ENTRIES: HistoryEntry[] = [
  { id:"d1", date:"2026-06-01", workout:true,  nf:true,  postedVideo:true,  reflectedJournal:true,  hoursWorked:8,   dailyViews:4200, summaryOfDay:"Big build day", mindsetNotes:"",                   journalTitle:"Building in public day 47", journalBody:"Solid session. Life GPA feature clicked.", mood:4, tags:["build","spicer-os"] },
  { id:"d2", date:"2026-05-31", workout:true,  nf:true,  postedVideo:false, reflectedJournal:true,  hoursWorked:6.5, dailyViews:3800, summaryOfDay:"Rest + content",  mindsetNotes:"",                   journalTitle:"",                         journalBody:"Took it easy. Filmed but didn't post. Need more energy.",  mood:3, tags:["rest"] },
  { id:"d3", date:"2026-05-30", workout:false, nf:true,  postedVideo:true,  reflectedJournal:false, hoursWorked:9,   dailyViews:5100, summaryOfDay:"Feature sprint",  mindsetNotes:"Flow state all day", journalTitle:"",                         journalBody:"Flow state. 9 hours straight.",                           mood:5, tags:["flow","coding"] },
  { id:"d4", date:"2026-05-29", workout:true,  nf:false, postedVideo:true,  reflectedJournal:true,  hoursWorked:5,   dailyViews:2900, summaryOfDay:"Distracted day",  mindsetNotes:"",                   journalTitle:"",                         journalBody:"Hard to focus. Too many distractions.",                   mood:2, tags:[] },
  { id:"d5", date:"2026-05-28", workout:true,  nf:true,  postedVideo:true,  reflectedJournal:true,  hoursWorked:7,   dailyViews:3300, summaryOfDay:"Solid",           mindsetNotes:"",                   journalTitle:"",                         journalBody:"Good day all around.",                                    mood:4, tags:["gratitude"] },
];

function monthKey(d: string) { return d.slice(0,7); }
function monthLabel(k: string) {
  const [y,m] = k.split("-").map(Number);
  return new Date(y, m-1, 1).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
}

const HABITS = [
  { key: "workout" as const,          icon: Dumbbell, label: "Workout" },
  { key: "nf"      as const,          icon: Flame,    label: "NF" },
  { key: "postedVideo" as const,      icon: Eye,      label: "Video" },
  { key: "reflectedJournal" as const, icon: Clock,    label: "Journal" },
];

export default function EntryHistoryPage() {
  const { isDemoMode } = useDemoMode();
  const [entries, setEntries]     = useState<HistoryEntry[]>([]);
  const [cursor, setCursor]       = useState<string | null>(null);
  const [hasMore, setHasMore]     = useState(true);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [query, setQuery]         = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HistoryEntry[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(initial = false) {
    if (isDemoMode) { setEntries(DEMO_ENTRIES); setLoading(false); return; }
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

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isDemoMode]);

  // Live journal search
  useEffect(() => {
    if (!query.trim()) { setSearchResults(null); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/journal?q=${encodeURIComponent(query.trim())}&limit=20`);
        const d = await r.json();
        // Map journal entries to HistoryEntry shape
        const mapped: HistoryEntry[] = (d.entries ?? []).map((e: any) => ({
          id: e.id, date: e.date, workout: false, nf: false, postedVideo: false, reflectedJournal: false,
          hoursWorked: 0, dailyViews: 0, summaryOfDay: "", mindsetNotes: "",
          journalTitle: e.title, journalBody: e.body, mood: e.mood, tags: e.tags ?? [],
        }));
        setSearchResults(mapped);
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const displayEntries = searchResults ?? entries;
  const grouped = displayEntries.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    (acc[monthKey(e.date)] ||= []).push(e);
    return acc;
  }, {});
  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Daily Entry</p>
          <h1 className="text-[24px] font-700 tracking-tight">History</h1>
        </div>
        <Link href="/d/entry">
          <Button variant="outline" size="sm"><ChevronLeft size={13} /> Today</Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search journal entries…"
          className="w-full pl-9 pr-3 py-2.5 text-[13px]"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-3">Searching…</span>}
      </div>

      {loading ? (
        <Card><SkeletonRows count={5} /></Card>
      ) : displayEntries.length === 0 ? (
        <Card><EmptyState icon={BookOpen} title={query ? "No matching entries" : "No entries yet"} body="Start writing to build your history." size="lg" /></Card>
      ) : (
        <div className="flex flex-col gap-6">
          {months.map(m => (
            <section key={m} className="flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-3 px-1">{monthLabel(m)}</p>
              {grouped[m].map(e => {
                const isOpen = expanded === e.id;
                const habitDone = HABITS.filter(h => e[h.key]).length;
                return (
                  <Card key={e.id} className="transition-all">
                    <button
                      className="w-full text-left"
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[13px] font-700 text-text-1">
                              {new Date(e.date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                            {e.mood != null && e.mood > 0 && <span className="text-[14px]">{MOODS[e.mood]}</span>}
                            {(e.tags ?? []).length > 0 && (
                              <div className="flex gap-1 flex-wrap">
                                {(e.tags ?? []).slice(0, 3).map(t => (
                                  <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-600 bg-accent-dim text-accent">
                                    <Tag size={7} />{t}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          {(e.journalTitle || e.summaryOfDay) && (
                            <p className="text-[12px] text-text-2 truncate">{e.journalTitle || e.summaryOfDay}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="flex gap-1">
                            {HABITS.map(h => (
                              <div
                                key={h.key}
                                className={`w-4 h-4 rounded-full flex items-center justify-center ${e[h.key] ? "bg-success/20" : "bg-[rgba(255,255,255,0.04)]"}`}
                              >
                                <h.icon size={9} className={e[h.key] ? "text-success" : "text-text-3"} />
                              </div>
                            ))}
                          </div>
                          {isOpen ? <ChevronUp size={14} className="text-text-3" /> : <ChevronDown size={14} className="text-text-3" />}
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="mt-4 flex flex-col gap-3 border-t border-border-dim pt-4">
                        {/* Habit dots + metrics */}
                        <div className="flex items-center gap-4 text-[12px]">
                          <div className="flex gap-2">
                            {HABITS.map(h => (
                              <div key={h.key} className={`flex items-center gap-1 ${e[h.key] ? "text-success" : "text-text-3"}`}>
                                <h.icon size={11} />
                                <span className="text-[10px]">{h.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-4 text-[12px] text-text-3">
                          {e.hoursWorked > 0 && <span>{e.hoursWorked}h worked</span>}
                          {e.dailyViews > 0  && <span>{e.dailyViews.toLocaleString()} views</span>}
                        </div>
                        {/* Journal body */}
                        {e.journalBody && (
                          <div className="px-3 py-3 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
                            {e.journalTitle && <p className="text-[13px] font-700 text-text-1 mb-2">{e.journalTitle}</p>}
                            <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{e.journalBody}</p>
                          </div>
                        )}
                        {/* Legacy mindset notes */}
                        {!e.journalBody && e.mindsetNotes && (
                          <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{e.mindsetNotes}</p>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </section>
          ))}

          {!query && hasMore && (
            <Button variant="outline" size="sm" loading={loadingMore} onClick={() => load(false)} className="w-full">
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
