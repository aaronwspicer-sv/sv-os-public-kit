"use client";
import { useState, useEffect, useRef } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/ToastProvider";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { config } from "@/config";
import { Clock, Plus, Trash2, Play, Square } from "lucide-react";

interface Block { id: string; date: string; project: string; duration_m: number; notes?: string; }

const DEMO_BLOCKS: Block[] = [
  { id: "d1", date: "2026-06-01", project: "YouTube",       duration_m: 120, notes: "Scripting episode 14" },
  { id: "d2", date: "2026-06-01", project: "Client Work",   duration_m: 90,  notes: "UGC deliverables" },
  { id: "d3", date: "2026-06-01", project: "Side Project",     duration_m: 45,  notes: "Building time tracking" },
  { id: "d4", date: "2026-05-31", project: "YouTube",       duration_m: 180, notes: "Filming + editing" },
  { id: "d5", date: "2026-05-31", project: "Admin",         duration_m: 30,  notes: "Invoices + email" },
  { id: "d6", date: "2026-05-30", project: "Side Project",     duration_m: 240, notes: "Feature batch" },
  { id: "d7", date: "2026-05-30", project: "YouTube",       duration_m: 60,  notes: "Thumbnail design" },
  { id: "d8", date: "2026-05-29", project: "Client Work",   duration_m: 150, notes: "Brand deal content" },
];

function fmtDuration(m: number) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

const PROJECT_COLORS = ["#1d9bf0", "#34d399", "#a78bfa", "#fbbf24", "#f87171", "#fb923c", "#c084fc", "#60a5fa"];
function projectColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

function DayChart({ blocks, totalM }: { blocks: Block[]; totalM: number }) {
  const byProject = blocks.reduce<Record<string, number>>((acc, b) => {
    acc[b.project] = (acc[b.project] ?? 0) + b.duration_m;
    return acc;
  }, {});
  const sorted = Object.entries(byProject).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-[rgba(255,255,255,0.04)]">
        {sorted.map(([p, m]) => (
          <div
            key={p}
            style={{ width: `${(m / totalM) * 100}%`, background: projectColor(p) }}
            className="h-full transition-all duration-500"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {sorted.map(([p, m]) => (
          <div key={p} className="flex items-center gap-1.5 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: projectColor(p) }} />
            <span className="text-text-2">{p}</span>
            <span className="text-text-3">{fmtDuration(m)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TimePage() {
  const { isDemoMode } = useDemoMode();
  const toast = useToast();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  // Log form
  const [project, setProject] = useState("");
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Stopwatch
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // seconds
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone, weekday: "long", month: "long", day: "numeric" });

  useEffect(() => {
    if (isDemoMode) { setBlocks(DEMO_BLOCKS); setLoading(false); return; }
    fetch(`/api/time-blocks?days=${days}`)
      .then(r => r.json())
      .then(d => { if (d.blocks) setBlocks(d.blocks); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isDemoMode, days]);

  function startTimer() {
    startRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    setRunning(true);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
    const m = Math.ceil(elapsed / 60);
    if (m > 0) {
      setHours(String(Math.floor(m / 60)));
      setMins(String(m % 60));
    }
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  function fmtElapsed(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }

  async function addBlock() {
    const h = Number(hours) || 0;
    const m = Number(mins) || 0;
    const total = h * 60 + m;
    if (!project.trim()) { toast.error("Project name required"); return; }
    if (total <= 0)      { toast.error("Enter a duration"); return; }
    if (isDemoMode) {
      const fake: Block = { id: `f${Date.now()}`, date: new Date().toISOString().slice(0,10), project: project.trim(), duration_m: total, notes: notes.trim() || undefined };
      setBlocks(prev => [fake, ...prev]);
      setProject(""); setHours(""); setMins(""); setNotes(""); setElapsed(0);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/time-blocks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: project.trim(), duration_m: total, notes: notes.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
      setBlocks(prev => [d.block, ...prev]);
      setProject(""); setHours(""); setMins(""); setNotes(""); setElapsed(0);
      toast.success("Time logged", `${project} — ${fmtDuration(total)}`);
    } catch (e: any) {
      toast.error("Failed to log", e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (!isDemoMode) {
      await fetch("/api/time-blocks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    }
  }

  // Group by date
  const grouped = blocks.reduce<Record<string, Block[]>>((acc, b) => {
    (acc[b.date] ||= []).push(b);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Totals
  const totalMins = blocks.reduce((s, b) => s + b.duration_m, 0);
  const totalToday = (grouped[new Date().toISOString().slice(0, 10)] ?? []).reduce((s, b) => s + b.duration_m, 0);

  // Weekly chart data (project totals)
  const allProjects = [...new Set(blocks.map(b => b.project))];
  const projectTotals = allProjects
    .map(p => ({ project: p, total: blocks.filter(b => b.project === p).reduce((s, b) => s + b.duration_m, 0) }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="animate-fade-up stagger-1">
        <p className="text-text-3 text-[12px] uppercase tracking-[0.18em] mb-1">{today}</p>
        <h1 className="text-[26px] font-700 tracking-tight flex items-center gap-3">
          <Clock size={22} className="text-accent" />
          Focus
        </h1>
        <p className="text-text-3 text-[12px] mt-1">Run a work session — it logs the time as hours worked.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 animate-fade-up stagger-2">
        <Card>
          <div className="text-[11px] text-text-3 mb-1">Today</div>
          <p className="text-[20px] font-700 tabular-nums text-accent">{fmtDuration(totalToday)}</p>
        </Card>
        <Card>
          <div className="text-[11px] text-text-3 mb-1">{days}d total</div>
          <p className="text-[20px] font-700 tabular-nums text-text-1">{fmtDuration(totalMins)}</p>
        </Card>
        <Card>
          <div className="text-[11px] text-text-3 mb-1">Daily avg</div>
          <p className="text-[20px] font-700 tabular-nums text-text-1">
            {fmtDuration(sortedDates.length > 0 ? Math.round(totalMins / sortedDates.length) : 0)}
          </p>
        </Card>
      </div>

      {/* Log new block */}
      <Card className="animate-fade-up stagger-2">
        <CardHeader>
          <div className="flex items-center gap-2"><Plus size={14} className="text-accent" /><CardTitle>Log Time</CardTitle></div>
          {/* Stopwatch */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-mono text-text-3 tabular-nums">{fmtElapsed(elapsed)}</span>
            <button
              onClick={running ? stopTimer : startTimer}
              className={`flex items-center gap-1 px-2 py-1 rounded-[8px] text-[11px] font-600 transition-all ${
                running ? "bg-[rgba(248,113,113,0.1)] text-danger border border-[rgba(248,113,113,0.2)]" : "bg-accent-dim text-accent border border-[rgba(29,155,240,0.2)]"
              }`}
            >
              {running ? <><Square size={10} /> Stop</> : <><Play size={10} /> Start</>}
            </button>
          </div>
        </CardHeader>
        <div className="flex flex-col gap-2 mt-1">
          <input
            value={project}
            onChange={e => setProject(e.target.value)}
            placeholder="Project name (YouTube, Client Work, Side Project…)"
            className="w-full px-3 py-2 text-[13px]"
            list="projects-list"
          />
          <datalist id="projects-list">
            {allProjects.map(p => <option key={p} value={p} />)}
          </datalist>
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="number" min={0} max={23}
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="h"
                className="w-[60px] px-2 py-2 text-[13px] text-center"
              />
              <span className="text-[12px] text-text-3">hr</span>
              <input
                type="number" min={0} max={59}
                value={mins}
                onChange={e => setMins(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addBlock()}
                placeholder="m"
                className="w-[60px] px-2 py-2 text-[13px] text-center"
              />
              <span className="text-[12px] text-text-3">min</span>
            </div>
            <Button variant="primary" size="sm" onClick={addBlock} loading={saving}>Log</Button>
          </div>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 text-[12px]"
          />
        </div>
      </Card>

      {/* Project breakdown */}
      {projectTotals.length > 0 && (
        <Card className="animate-fade-up stagger-3">
          <CardHeader>
            <CardTitle>By Project ({days}d)</CardTitle>
            <div className="flex gap-1">
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`text-[10px] px-2 py-0.5 rounded-[6px] font-600 transition-colors ${days === d ? "bg-accent text-white" : "text-text-3 border border-border-dim hover:text-text-1"}`}
                >{d}d</button>
              ))}
            </div>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {projectTotals.map(({ project: p, total }) => (
              <div key={p}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: projectColor(p) }} />
                    <span className="text-[13px] text-text-1">{p}</span>
                  </div>
                  <span className="text-[12px] font-700 tabular-nums font-mono text-text-1">{fmtDuration(total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.04)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(total / totalMins) * 100}%`, background: projectColor(p) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Log by day */}
      <div className="flex flex-col gap-3 animate-fade-up stagger-3">
        {loading ? (
          <Card><p className="text-[12px] text-text-3 text-center py-8">Loading…</p></Card>
        ) : sortedDates.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Clock size={28} className="text-text-3" />
              <p className="text-[13px] text-text-3">No time logged yet. Start tracking above.</p>
            </div>
          </Card>
        ) : sortedDates.map(date => {
          const dayBlocks = grouped[date];
          const dayTotal = dayBlocks.reduce((s, b) => s + b.duration_m, 0);
          const isToday = date === new Date().toISOString().slice(0, 10);
          return (
            <Card key={date}>
              <CardHeader>
                <div>
                  <p className="text-[12px] font-600 text-text-1">{isToday ? "Today" : new Date(date + "T12:00:00").toLocaleDateString("en-CA", { weekday: "long", month: "short", day: "numeric" })}</p>
                </div>
                <Badge variant={isToday ? "accent" : "muted"}>{fmtDuration(dayTotal)}</Badge>
              </CardHeader>
              <DayChart blocks={dayBlocks} totalM={dayTotal} />
              <div className="flex flex-col gap-1.5 mt-3">
                {dayBlocks.map(b => (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-[8px] bg-[rgba(255,255,255,0.03)]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: projectColor(b.project) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-600 text-text-1">{b.project}</p>
                      {b.notes && <p className="text-[11px] text-text-3 truncate">{b.notes}</p>}
                    </div>
                    <span className="text-[12px] font-700 tabular-nums font-mono text-text-2">{fmtDuration(b.duration_m)}</span>
                    <button onClick={() => deleteBlock(b.id)} className="text-text-3 hover:text-danger transition-colors p-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
