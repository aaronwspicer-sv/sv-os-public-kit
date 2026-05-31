"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flame, Clock, Eye, Dumbbell, Check, Loader2, CloudUpload } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { config } from "@/config";

interface LogEntry {
  workout: boolean;
  nf: boolean;
  postedVideo: boolean;
  reflectedJournal: boolean;
  hoursWorked: number;
  dailyViews: number;
  summaryOfDay: string;
  mindsetNotes: string;
}

const defaultEntry: LogEntry = {
  workout: false, nf: false, postedVideo: false, reflectedJournal: false,
  hoursWorked: 0, dailyViews: 0, summaryOfDay: "", mindsetNotes: "",
};

function StreakBadge({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <Flame size={13} className={count > 0 ? "text-warning" : "text-text-3"} />
        <span className={`text-[18px] font-700 tabular-nums ${count > 0 ? "text-warning" : "text-text-3"}`}>
          {count}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-text-3">{label}</span>
    </div>
  );
}

type DraftStatus = "idle" | "saving" | "saved" | "error";
type NotionStatus = "idle" | "pushing" | "pushed" | "error";

export default function LogPage() {
  const toast = useToast();
  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });
  const [entry, setEntry] = useState<LogEntry>(defaultEntry);
  const [loading, setLoading] = useState(true);
  const [draftStatus, setDraftStatus]   = useState<DraftStatus>("idle");
  const [notionStatus, setNotionStatus] = useState<NotionStatus>("idle");
  const [notionPushed, setNotionPushed] = useState(false); // true after a successful Save to Notion
  const [streaks, setStreaks] = useState({ workout: 0, video: 0, journal: 0, nf: 0 });

  const entryRef    = useRef(entry);
  useEffect(() => { entryRef.current = entry; }, [entry]);

  // Debounce timer for draft auto-save
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mount: load draft, fall back to Notion entry ──
  useEffect(() => {
    (async () => {
      try {
        // 1. Server-side draft (cross-device) takes priority
        const dRes = await fetch("/api/log/draft").then(r => r.json()).catch(() => null);
        if (dRes?.entry) {
          setEntry({ ...defaultEntry, ...dRes.entry });
          setLoading(false);
        } else {
          // 2. Notion entry (if Aaron previously hit Save to Notion today)
          const nRes = await fetch("/api/notion/log").then(r => r.json()).catch(() => null);
          if (nRes?.entry) {
            setEntry({ ...defaultEntry, ...nRes.entry });
            setNotionPushed(true);
          }
          setLoading(false);
        }
      } catch {
        setLoading(false);
      }
    })();

    fetch("/api/notion/streaks")
      .then(r => r.json())
      .then(data => { if (data.streaks) setStreaks(data.streaks); })
      .catch(console.error);
  }, []);

  // ── Save draft to Supabase (debounced, never hits Notion) ──
  const saveDraft = useCallback(async (payload: LogEntry) => {
    setDraftStatus("saving");
    try {
      const r = await fetch("/api/log/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Draft save failed");
      setDraftStatus("saved");
      setTimeout(() => setDraftStatus(s => s === "saved" ? "idle" : s), 1500);
    } catch (e: any) {
      setDraftStatus("error");
      // Quiet failure — draft errors are common and shouldn't spam toasts
      console.error("draft save:", e?.message);
    }
  }, []);

  function update<K extends keyof LogEntry>(key: K, value: LogEntry[K]) {
    const next = { ...entryRef.current, [key]: value };
    setEntry(next);
    setNotionPushed(false); // mark dirty — pushing to Notion will re-confirm
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveDraft(next), 500);
  }

  // ── Explicit Save to Notion ──
  async function saveToNotion() {
    setNotionStatus("pushing");
    try {
      const r = await fetch("/api/notion/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entryRef.current),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error) throw new Error(d.error ?? "Notion save failed");
      setNotionStatus("pushed");
      setNotionPushed(true);
      toast.success("Saved to Notion", "Entry created with all properties.");
      // Clear the draft now that Notion has the source of truth
      fetch("/api/log/draft", { method: "DELETE" }).catch(() => {});
      setTimeout(() => setNotionStatus(s => s === "pushed" ? "idle" : s), 3000);
    } catch (e: any) {
      setNotionStatus("error");
      toast.error("Notion save failed", e?.message ?? "Unknown error");
    }
  }

  const checkboxes = [
    { key: "workout" as const,          icon: Dumbbell, label: "Workout" },
    { key: "nf" as const,               icon: Flame,    label: "NF" },
    { key: "postedVideo" as const,      icon: Eye,      label: "Posted 1 Video or Reel" },
    { key: "reflectedJournal" as const, icon: Clock,    label: "Reflected in Journal" },
  ];

  const doneCount = checkboxes.filter(c => entry[c.key]).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="animate-fade-up stagger-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Daily Log</p>
          <h1 className="text-[24px] font-700 tracking-tight">{today}</h1>
          <DraftIndicator status={draftStatus} pushed={notionPushed} />
        </div>
        <a
          href="/d/log/history"
          className="text-[12px] font-600 text-text-3 hover:text-accent transition-colors px-3 py-1.5 rounded-[10px] border border-border-dim hover:border-[rgba(29,155,240,0.3)]"
        >
          History →
        </a>
      </div>

      {/* Streak row */}
      <div className="animate-fade-up stagger-2">
        <Card className="flex justify-around py-4">
          <StreakBadge label="Workout" count={streaks.workout} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="Video" count={streaks.video} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="Journal" count={streaks.journal} />
          <div className="w-px bg-border-dim" />
          <StreakBadge label="NF" count={streaks.nf} />
        </Card>
      </div>

      {/* Today's checkboxes */}
      <div className="animate-fade-up stagger-3">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Habits</CardTitle>
            <Badge variant={doneCount === checkboxes.length ? "success" : "muted"}>
              {doneCount}/{checkboxes.length}
            </Badge>
          </CardHeader>

          {loading ? (
            <p className="text-text-3 text-[12px] text-center py-4">Loading draft…</p>
          ) : <div className="flex flex-col gap-3">
            {checkboxes.map(({ key, label }) => (
              <Checkbox
                key={key}
                checked={entry[key] as boolean}
                onChange={(v) => update(key, v)}
                label={label}
              />
            ))}
          </div>}
        </Card>
      </div>

      {/* Numbers */}
      <div className="animate-fade-up stagger-4 grid grid-cols-2 gap-3">
        <Card>
          <CardTitle className="mb-2">Hours Worked</CardTitle>
          <input
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={entry.hoursWorked || ""}
            onChange={(e) => update("hoursWorked", parseFloat(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-3 py-2 text-[20px] font-700 tabular-nums"
          />
        </Card>
        <Card>
          <CardTitle className="mb-2">Daily Views</CardTitle>
          <input
            type="number"
            min={0}
            value={entry.dailyViews || ""}
            onChange={(e) => update("dailyViews", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-3 py-2 text-[20px] font-700 tabular-nums"
          />
        </Card>
      </div>

      {/* Text fields */}
      <div className="animate-fade-up stagger-5 flex flex-col gap-3">
        <Card>
          <CardTitle className="mb-2">Summary of Day</CardTitle>
          <textarea
            rows={3}
            value={entry.summaryOfDay}
            onChange={(e) => update("summaryOfDay", e.target.value)}
            placeholder="How did today go..."
            className="w-full px-3 py-2 text-[13px] resize-none"
          />
        </Card>
        <Card>
          <CardTitle className="mb-2">Mindset Notes</CardTitle>
          <textarea
            rows={3}
            value={entry.mindsetNotes}
            onChange={(e) => update("mindsetNotes", e.target.value)}
            placeholder="What&apos;s on your mind..."
            className="w-full px-3 py-2 text-[13px] resize-none"
          />
        </Card>
      </div>

      {/* Explicit Save to Notion */}
      <div className="animate-fade-up stagger-6 flex flex-col gap-2">
        <Button
          variant="primary"
          size="lg"
          loading={notionStatus === "pushing"}
          onClick={saveToNotion}
          disabled={loading}
          className="w-full"
        >
          <CloudUpload size={16} />
          {notionPushed ? "Update Notion entry" : "Save to Notion"}
        </Button>
        <p className="text-center text-[11px] text-text-3">
          Drafts auto-sync across devices. Notion is only written when you press save.
        </p>
      </div>
    </div>
  );
}

function DraftIndicator({ status, pushed }: { status: DraftStatus; pushed: boolean }) {
  if (pushed) return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-success mt-1">
      <Check size={11} /> Saved to Notion
    </span>
  );
  if (status === "saving") return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-3 mt-1">
      <Loader2 size={11} className="animate-spin" /> Saving draft…
    </span>
  );
  if (status === "saved") return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-text-3 mt-1">
      <Check size={11} /> Draft saved
    </span>
  );
  if (status === "error") return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-danger mt-1">
      ⚠ Draft save failed
    </span>
  );
  return null;
}
