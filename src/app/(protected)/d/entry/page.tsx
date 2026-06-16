"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { config } from "@/config";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { DayPlanner } from "@/components/DayPlanner";
import { DEMO_HOURS_WORKED, DEMO_DAILY_VIEWS, DEMO_SUMMARY, DEMO_MINDSET } from "@/lib/demoMode";
import {
  Flame, Clock, Eye, Dumbbell, Check, Loader2, CloudUpload, BookOpen, Tag, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface LogEntry {
  workout: boolean; nf: boolean; postedVideo: boolean; reflectedJournal: boolean;
  hoursWorked: number; dailyViews: number; summaryOfDay: string; mindsetNotes: string;
}
interface JournalEntry { id?: string; date: string; title: string; body: string; mood: number | null; tags: string[]; }

const defaultLog: LogEntry = {
  workout: false, nf: false, postedVideo: false, reflectedJournal: false,
  hoursWorked: 0, dailyViews: 0, summaryOfDay: "", mindsetNotes: "",
};
const defaultJournal: JournalEntry = { date: "", title: "", body: "", mood: null, tags: [] };

type DraftStatus  = "idle" | "saving" | "saved" | "error";
type NotionStatus = "idle" | "pushing" | "pushed" | "error";

const MOODS = [
  { v: 1, e: "😞", label: "Rough" },
  { v: 2, e: "😐", label: "Meh" },
  { v: 3, e: "🙂", label: "OK" },
  { v: 4, e: "😊", label: "Good" },
  { v: 5, e: "🤩", label: "Amazing" },
];

// ── Sub-components ─────────────────────────────────────────────
function StreakBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <Flame size={13} className={count > 0 ? "text-warning" : "text-text-3"} />
        <span className={`text-[18px] font-700 tabular-nums ${count > 0 ? "text-warning" : "text-text-3"}`}>{count}</span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-text-3">{label}</span>
    </div>
  );
}

function DraftIndicator({ status, pushed }: { status: DraftStatus; pushed: boolean }) {
  if (pushed) return <span className="inline-flex items-center gap-1.5 text-[11px] text-success mt-1"><Check size={11} /> Saved to Notion</span>;
  if (status === "saving") return <span className="inline-flex items-center gap-1.5 text-[11px] text-text-3 mt-1"><Loader2 size={11} className="animate-spin" /> Saving draft…</span>;
  if (status === "saved")  return <span className="inline-flex items-center gap-1.5 text-[11px] text-text-3 mt-1"><Check size={11} /> Draft saved</span>;
  if (status === "error")  return <span className="inline-flex items-center gap-1.5 text-[11px] text-danger mt-1">⚠ Draft save failed</span>;
  return null;
}

// ── Main page ──────────────────────────────────────────────────
export default function EntryPage() {
  const { isDemoMode } = useDemoMode();
  const toast = useToast();

  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });

  // ── Log state ──
  const [log, setLog]             = useState<LogEntry>(defaultLog);
  const [loading, setLoading]     = useState(true);
  const [draftStatus, setDraftStatus]   = useState<DraftStatus>("idle");
  const [notionStatus, setNotionStatus] = useState<NotionStatus>("idle");
  const [notionPushed, setNotionPushed] = useState(false);
  const [streaks, setStreaks]     = useState({ workout: 0, video: 0, journal: 0, nf: 0 });

  // ── Journal state ──
  const [journal, setJournal]     = useState<JournalEntry>({ ...defaultJournal, date: todayStr });
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalSaved, setJournalSaved]   = useState(false);

  // ── Tag input ──
  const [tagInput, setTagInput]   = useState("");

  const logRef     = useRef(log);
  const journalRef = useRef(journal);
  useEffect(() => { logRef.current = log; }, [log]);
  useEffect(() => { journalRef.current = journal; }, [journal]);

  const logDebounce  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jrnlDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Demo mode ──
  useEffect(() => {
    if (!isDemoMode) return;
    setLog({
      workout: true, nf: true, postedVideo: true, reflectedJournal: false,
      hoursWorked: DEMO_HOURS_WORKED, dailyViews: DEMO_DAILY_VIEWS,
      summaryOfDay: DEMO_SUMMARY, mindsetNotes: DEMO_MINDSET,
    });
    setJournal({
      date: todayStr, title: "Building in public day 47",
      body: "Had a solid session today. The Life GPA feature clicked — watching the ring fill up actually made me want to hit every habit. Feels like gamification done right.\n\nStill need to work on consistency with the journal habit itself. Tomorrow: wake up at 6, write first, then code.",
      mood: 4, tags: ["reflection", "spicer-os", "build"],
    });
    setStreaks({ workout: 14, video: 7, journal: 21, nf: 30 });
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  // ── Load data ──
  useEffect(() => {
    if (isDemoMode) return;
    (async () => {
      try {
        const [draftRes, journalRes, streakRes] = await Promise.all([
          fetch("/api/log/draft").then(r => r.json()).catch(() => null),
          fetch(`/api/journal?date=${todayStr}`).then(r => r.json()).catch(() => null),
          fetch("/api/notion/streaks").then(r => r.json()).catch(() => null),
        ]);

        let loadedMindset = "";
        if (draftRes?.entry) {
          setLog({ ...defaultLog, ...draftRes.entry });
          loadedMindset = draftRes.entry.mindsetNotes ?? "";
        } else {
          const nRes = await fetch("/api/notion/log").then(r => r.json()).catch(() => null);
          if (nRes?.entry) { setLog({ ...defaultLog, ...nRes.entry }); setNotionPushed(true); loadedMindset = nRes.entry.mindsetNotes ?? ""; }
        }
        if (journalRes?.entry) {
          setJournal({ ...defaultJournal, date: todayStr, ...journalRes.entry });
        } else if (loadedMindset) {
          // Seed journal body from Notion mindsetNotes if no journal entry exists yet
          setJournal(j => ({ ...j, body: loadedMindset }));
        }
        if (streakRes?.streaks) setStreaks(streakRes.streaks);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  // ── Log draft auto-save ──
  const saveDraft = useCallback(async (payload: LogEntry) => {
    setDraftStatus("saving");
    try {
      const r = await fetch("/api/log/draft", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Draft save failed");
      setDraftStatus("saved");
      setTimeout(() => setDraftStatus(s => s === "saved" ? "idle" : s), 1500);
    } catch { setDraftStatus("error"); }
  }, []);

  function updateLog<K extends keyof LogEntry>(key: K, value: LogEntry[K]) {
    const next = { ...logRef.current, [key]: value };
    setLog(next);
    setNotionPushed(false);
    if (logDebounce.current) clearTimeout(logDebounce.current);
    logDebounce.current = setTimeout(() => saveDraft(next), 500);
  }

  // ── Journal auto-save ──
  const saveJournal = useCallback(async (payload: JournalEntry) => {
    if (isDemoMode) return;
    setJournalSaving(true);
    try {
      const r = await fetch("/api/journal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Journal save failed");
      if (d.entry?.id) setJournal(j => ({ ...j, id: d.entry.id }));
      setJournalSaved(true);
      setTimeout(() => setJournalSaved(false), 2000);
    } catch { /* silent */ } finally {
      setJournalSaving(false);
    }
  }, [isDemoMode]);

  function updateJournal<K extends keyof JournalEntry>(key: K, value: JournalEntry[K]) {
    const next = { ...journalRef.current, [key]: value };
    setJournal(next);
    // Keep mindsetNotes in sync so "Save to Notion" always reflects the journal body
    if (key === "body") {
      const nextLog = { ...logRef.current, mindsetNotes: value as string };
      setLog(nextLog);
    }
    if (jrnlDebounce.current) clearTimeout(jrnlDebounce.current);
    jrnlDebounce.current = setTimeout(() => saveJournal(next), 800);
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
    if (!tag || journal.tags.includes(tag) || journal.tags.length >= 10) return;
    updateJournal("tags", [...journal.tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) { updateJournal("tags", journal.tags.filter(t => t !== tag)); }

  // ── Notion save ──
  async function saveToNotion() {
    setNotionStatus("pushing");
    try {
      const r = await fetch("/api/notion/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...logRef.current,
          journalTitle: journalRef.current.title,
          mood:         journalRef.current.mood,
          tags:         journalRef.current.tags,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Notion save failed");
      setNotionStatus("pushed"); setNotionPushed(true);
      toast.success("Saved to Notion", "Entry created with all properties.");
      fetch("/api/log/draft", { method: "DELETE" }).catch(() => {});
      setTimeout(() => setNotionStatus(s => s === "pushed" ? "idle" : s), 3000);
    } catch (e: any) {
      setNotionStatus("error");
      toast.error("Notion save failed", e?.message ?? "Unknown error");
    }
  }

  const checkboxes = [
    { key: "workout"          as const, icon: Dumbbell, label: "Workout" },
    { key: "nf"               as const, icon: Flame,    label: "NF" },
    { key: "postedVideo"      as const, icon: Eye,      label: "Posted 1 Video or Reel" },
    { key: "reflectedJournal" as const, icon: Clock,    label: "Reflected in Journal" },
  ];
  const doneCount = checkboxes.filter(c => log[c.key]).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="animate-fade-up stagger-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Daily Entry</p>
          <h1 className="text-[24px] font-700 tracking-tight">{today}</h1>
          <DraftIndicator status={draftStatus} pushed={notionPushed} />
        </div>
        <a
          href="/d/entry/history"
          className="text-[12px] font-600 text-text-3 hover:text-accent transition-colors px-3 py-1.5 rounded-[10px] border border-border-dim hover:border-[rgba(29,155,240,0.3)]"
        >
          History →
        </a>
      </div>

      {/* Streaks */}
      <div className="animate-fade-up stagger-2">
        <Card className="flex justify-around py-4">
          <StreakBadge label="Workout" count={streaks.workout} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="Video"   count={streaks.video} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="Journal" count={streaks.journal} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="NF"      count={streaks.nf} />
        </Card>
      </div>

      {/* Plan the day — today + tomorrow (moved here from Goals) */}
      <div className="animate-fade-up stagger-2">
        <DayPlanner />
      </div>

      {/* Habits */}
      <div className="animate-fade-up stagger-3">
        <Card>
          <CardHeader>
            <CardTitle>Habits</CardTitle>
            <Badge variant={doneCount === checkboxes.length ? "success" : "muted"}>{doneCount}/{checkboxes.length}</Badge>
          </CardHeader>
          {loading ? (
            <p className="text-text-3 text-[12px] text-center py-4">Loading…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {checkboxes.map(({ key, label }) => (
                <Checkbox key={key} checked={log[key] as boolean} onChange={v => updateLog(key, v)} label={label} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Metrics */}
      <div className="animate-fade-up stagger-4 grid grid-cols-2 gap-3">
        <Card>
          <CardTitle className="mb-2">Hours Worked</CardTitle>
          <input
            type="number" min={0} max={24} step={0.5}
            value={log.hoursWorked || ""}
            onChange={e => updateLog("hoursWorked", parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-3 py-2 text-[20px] font-700 tabular-nums"
          />
        </Card>
        <Card>
          <CardTitle className="mb-2">Daily Views</CardTitle>
          <input
            type="number" min={0}
            value={log.dailyViews || ""}
            onChange={e => updateLog("dailyViews", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-3 py-2 text-[20px] font-700 tabular-nums"
          />
        </Card>
      </div>

      {/* Journal */}
      <div className="animate-fade-up stagger-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-accent" />
              <CardTitle>Journal</CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              {journalSaving && <span className="text-text-3"><Loader2 size={10} className="inline animate-spin mr-1" />Saving…</span>}
              {journalSaved  && <span className="text-success"><Check size={10} className="inline mr-1" />Saved</span>}
            </div>
          </CardHeader>

          {/* Mood */}
          <div className="mb-4">
            <p className="text-[11px] text-text-3 mb-2">Mood</p>
            <div className="flex gap-2">
              {MOODS.map(m => (
                <button
                  key={m.v}
                  onClick={() => updateJournal("mood", journal.mood === m.v ? null : m.v)}
                  title={m.label}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-[10px] transition-all ${
                    journal.mood === m.v
                      ? "bg-accent-dim border border-[rgba(29,155,240,0.3)] scale-110"
                      : "border border-transparent hover:bg-[rgba(255,255,255,0.04)]"
                  }`}
                >
                  <span className="text-[20px]">{m.e}</span>
                  <span className="text-[9px] text-text-3">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <input
            value={journal.title}
            onChange={e => updateJournal("title", e.target.value)}
            placeholder="Entry title (optional)"
            className="w-full px-3 py-2 text-[14px] font-600 mb-2"
          />

          {/* Body */}
          <textarea
            rows={8}
            value={journal.body}
            onChange={e => updateJournal("body", e.target.value)}
            placeholder="What happened today? What are you thinking about? Write freely…"
            className="w-full px-3 py-2 text-[13px] resize-y leading-relaxed"
          />

          {/* Tags */}
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {journal.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 bg-accent-dim text-accent border border-[rgba(29,155,240,0.2)]">
                  <Tag size={9} />
                  {t}
                  <button onClick={() => removeTag(t)} className="ml-0.5 hover:text-danger"><X size={9} /></button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                if (e.key === "Backspace" && !tagInput && journal.tags.length > 0) removeTag(journal.tags[journal.tags.length - 1]);
              }}
              placeholder="Add tag… (Enter or comma)"
              className="w-full px-3 py-1.5 text-[12px]"
            />
          </div>
        </Card>
      </div>

      {/* Summary of day (Notion field) */}
      <div className="animate-fade-up stagger-5">
        <Card>
          <CardTitle className="mb-2">Summary of Day</CardTitle>
          <textarea
            rows={3}
            value={log.summaryOfDay}
            onChange={e => updateLog("summaryOfDay", e.target.value)}
            placeholder="One-line summary for Notion / Alfred…"
            className="w-full px-3 py-2 text-[13px] resize-none"
          />
        </Card>
      </div>

      {/* Notion save */}
      <div className="animate-fade-up stagger-6 flex flex-col gap-2">
        <Button
          variant="primary" size="lg"
          loading={notionStatus === "pushing"}
          onClick={saveToNotion}
          disabled={loading}
          className="w-full"
        >
          <CloudUpload size={16} />
          {notionPushed ? "Update Notion entry" : "Save habits to Notion"}
        </Button>
        <p className="text-center text-[11px] text-text-3">
          Journal auto-saves. Notion is only written when you press save.
        </p>
      </div>
    </div>
  );
}
