"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Plus, Trash2, Zap } from "lucide-react";
import { getActiveDateString, getTomorrowDateString, formatDate } from "@/lib/utils";

interface DailyGoal {
  id: string;
  text: string;
  done: boolean;
  queued: boolean;
  date: string;
}

function GoalTicker({ goals }: { goals: DailyGoal[] }) {
  const pending   = goals.filter(g => !g.done);
  const doneCount = goals.filter(g => g.done).length;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[rgba(0,0,0,0.4)] border border-border-dim">
      <span className="w-2 h-2 rounded-full bg-accent animate-led flex-shrink-0" />
      <span className="text-[9px] font-800 uppercase tracking-[0.18em] text-text-3 flex-shrink-0">Goals</span>
      <div className="flex-1 overflow-hidden">
        <p className="text-[12px] font-600 text-text-1 truncate">
          {pending.length === 0
            ? goals.length === 0 ? "No goals yet — add one below" : "✓ All goals done — solid day"
            : pending[0]?.text}
        </p>
      </div>
      <span className="text-[11px] font-700 tabular-nums text-text-3 flex-shrink-0 font-mono">
        {doneCount}/{goals.length}
      </span>
    </div>
  );
}

function LifeGoalCard({ goal }: { goal: { title: string; target: number; current: number; status: string; priority: string; dueDate?: string } }) {
  const pct       = goal.target > 0 ? Math.min(100, (goal.current / goal.target) * 100) : 0;
  const remaining = goal.target - goal.current;
  const priorityVariant = goal.priority === "High" ? "danger" : goal.priority === "Medium" ? "warning" : "muted";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-600 text-text-1">{goal.title}</p>
        <Badge variant={priorityVariant as never}>{goal.priority}</Badge>
      </div>
      <ProgressBar value={pct} color="accent" />
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-text-3">
          <span className="text-text-1 font-700 tabular-nums font-mono">${goal.current.toLocaleString("en-CA")}</span>
          <span className="text-text-3"> / ${goal.target.toLocaleString("en-CA")} CAD</span>
        </span>
        <span className="text-text-3">${remaining.toLocaleString("en-CA")} left</span>
      </div>
      {goal.dueDate && <p className="text-[11px] text-text-3">Due {formatDate(goal.dueDate)}</p>}
    </Card>
  );
}

interface LifeGoal {
  id: string; title: string; target: number; current: number; status: string; priority: string; dueDate?: string;
}

export default function GoalsPage() {
  const todayStr      = getActiveDateString();
  const tomorrowStr   = getTomorrowDateString();
  const todayLabel    = formatDate(todayStr);
  const tomorrowLabel = formatDate(tomorrowStr);

  const [todayGoals, setTodayGoals]   = useState<DailyGoal[]>([]);
  const [tomorrowGoals, setTomorrow]  = useState<DailyGoal[]>([]);
  const [input, setInput]             = useState("");
  const [tomorrowInput, setTomorrowInput] = useState("");
  const [lifeGoals, setLifeGoals]     = useState<LifeGoal[]>([]);
  const [loadingTodos, setLoadingTodos]   = useState(true);
  const [loadingGoals, setLoadingGoals]   = useState(true);
  const [todosError, setTodosError]       = useState<string | null>(null);
  const [goalsError, setGoalsError]       = useState<string | null>(null);
  const [addError, setAddError]           = useState<string | null>(null);

  // Load todos from Supabase
  useEffect(() => {
    fetch("/api/todos")
      .then(async r => {
        const data = await r.json();
        if (!r.ok || data.error) { setTodosError(data.error ?? "Failed to load todos"); return; }
        if (data.todayGoals)    setTodayGoals(data.todayGoals);
        if (data.tomorrowGoals) setTomorrow(data.tomorrowGoals);
      })
      .catch(e => setTodosError(e?.message ?? "Network error"))
      .finally(() => setLoadingTodos(false));
  }, []);

  // Load life goals from Notion
  useEffect(() => {
    fetch("/api/notion/goals")
      .then(async r => {
        const data = await r.json();
        if (!r.ok || data.error) { setGoalsError(data.error ?? "Failed to load life goals"); return; }
        if (data.goals) setLifeGoals(data.goals);
      })
      .catch(e => setGoalsError(e?.message ?? "Network error"))
      .finally(() => setLoadingGoals(false));
  }, []);

  const doneCount = todayGoals.filter(g => g.done).length;
  const allDone   = todayGoals.length > 0 && doneCount === todayGoals.length;

  async function addGoal(date: string) {
    const text = (date === todayStr ? input : tomorrowInput).trim();
    if (!text) return;
    setAddError(null);

    try {
      const res  = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, date }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAddError(data.error ?? "Failed to save — table may not exist in Supabase");
        return;
      }
      if (data.todo) {
        if (date === todayStr) { setTodayGoals(prev => [...prev, data.todo]); setInput(""); }
        else                   { setTomorrow(prev => [...prev, data.todo]);   setTomorrowInput(""); }
      }
    } catch (e: any) {
      setAddError(e?.message ?? "Network error");
    }
  }

  async function toggleDone(id: string, current: boolean) {
    setTodayGoals(prev => prev.map(g => g.id === id ? { ...g, done: !current } : g));
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, done: !current }),
    });
  }

  async function toggleQueue(id: string, current: boolean) {
    setTodayGoals(prev => prev.map(g => g.id === id ? { ...g, queued: !current } : g));
    await fetch("/api/todos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, queued: !current }),
    });
  }

  async function deleteGoal(id: string, date: string) {
    if (date === todayStr) setTodayGoals(prev => prev.filter(g => g.id !== id));
    else                   setTomorrow(prev => prev.filter(g => g.id !== id));
    await fetch("/api/todos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function pushRemaining() {
    const unchecked = todayGoals.filter(g => !g.done);
    const existingTexts = new Set(tomorrowGoals.map(g => g.text));

    for (const g of unchecked) {
      if (existingTexts.has(g.text)) continue;
      const res  = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: g.text, date: tomorrowStr }),
      });
      const data = await res.json();
      if (data.todo) setTomorrow(prev => [...prev, data.todo]);
    }

    // Remove unchecked from today
    for (const g of unchecked) await deleteGoal(g.id, todayStr);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up stagger-1">
        <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Goals</p>
        <h1 className="text-[24px] font-700 tracking-tight">Daily + Life Goals</h1>
      </div>

      <div className="animate-fade-up stagger-2">
        <GoalTicker goals={todayGoals} />
      </div>

      {(todosError || addError) && (
        <div className="px-4 py-3 rounded-[12px] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)]">
          <p className="text-[11px] uppercase tracking-widest text-danger font-700 mb-1">Todos error</p>
          <p className="text-[12px] text-danger break-all">{todosError ?? addError}</p>
          <p className="text-[10px] text-text-3 mt-1">If this says &quot;relation does not exist&quot;, run the schema.sql in Supabase.</p>
        </div>
      )}

      {/* TODAY */}
      <div className="animate-fade-up stagger-3">
        <Card variant={allDone ? "success" : "default"} glow={allDone}>
          <CardHeader>
            <div>
              <CardTitle>Today — {todayLabel}</CardTitle>
              {allDone && <p className="text-[11px] text-success mt-0.5">All done — solid day</p>}
            </div>
            <div className="flex items-center gap-2">
              {doneCount > 0 && <Badge variant="streak">🔥 {doneCount} done</Badge>}
              <Badge variant="muted">{doneCount}/{todayGoals.length}</Badge>
            </div>
          </CardHeader>

          {todayGoals.length > 0 && (
            <ProgressBar value={(doneCount / todayGoals.length) * 100} segments={todayGoals.length} color={allDone ? "success" : "accent"} className="mb-4" />
          )}

          <div className="flex flex-col gap-2 mb-4">
            {loadingTodos ? (
              <p className="text-[12px] text-text-3 italic text-center py-4">Loading…</p>
            ) : todayGoals.length === 0 ? (
              <p className="text-[12px] text-text-3 italic text-center py-4">No goals for today yet — add one below</p>
            ) : todayGoals.map(goal => (
              <div
                key={goal.id}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] transition-all ${
                  goal.done   ? "opacity-45 bg-[rgba(52,211,153,0.04)]" :
                  goal.queued ? "bg-[rgba(29,155,240,0.08)] border-l-2 border-accent" :
                  "bg-[rgba(255,255,255,0.03)]"
                }`}
              >
                <Checkbox checked={goal.done} onChange={() => toggleDone(goal.id, goal.done)} />
                <span className={`flex-1 text-[13px] ${goal.done ? "line-through text-text-3" : "text-text-1"}`}>
                  {goal.text}
                </span>
                <button onClick={() => toggleQueue(goal.id, goal.queued)} title="Queue" className="text-text-3 hover:text-accent transition-colors p-1">
                  <Zap size={13} />
                </button>
                <button onClick={() => deleteGoal(goal.id, todayStr)} title="Delete" className="text-text-3 hover:text-danger transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          {todayGoals.some(g => !g.done) && (
            <button
              onClick={pushRemaining}
              className="w-full py-2 text-[12px] text-text-3 border border-dashed border-border-dim rounded-[10px] hover:border-accent hover:text-accent transition-all mb-3"
            >
              Push remaining to tomorrow
            </button>
          )}

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal(todayStr)}
              placeholder="Add a goal for today…"
              className="flex-1 px-3 py-2 text-[13px]"
            />
            <Button variant="primary" size="sm" onClick={() => addGoal(todayStr)}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </Card>
      </div>

      {/* TOMORROW */}
      <div className="animate-fade-up stagger-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Plan tomorrow — {tomorrowLabel}</CardTitle>
              <p className="text-[11px] text-text-3 mt-0.5">Write tonight, locked until 6 AM.</p>
            </div>
            <Badge variant="muted">{tomorrowGoals.length} planned</Badge>
          </CardHeader>
          <div className="flex flex-col gap-2 mb-4">
            {tomorrowGoals.length === 0 ? (
              <p className="text-[12px] text-text-3 italic text-center py-3">Nothing planned for tomorrow yet</p>
            ) : tomorrowGoals.map(goal => (
              <div key={goal.id} className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <Checkbox checked={false} onChange={() => {}} disabled label={goal.text} />
                <button onClick={() => deleteGoal(goal.id, tomorrowStr)} className="ml-auto text-text-3 hover:text-danger transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tomorrowInput}
              onChange={(e) => setTomorrowInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGoal(tomorrowStr)}
              placeholder="Plan something for tomorrow…"
              className="flex-1 px-3 py-2 text-[13px]"
            />
            <Button variant="primary" size="sm" onClick={() => addGoal(tomorrowStr)}>
              <Plus size={14} /> Add
            </Button>
          </div>
        </Card>
      </div>

      {/* Life Goals divider */}
      <div className="animate-fade-up stagger-5 flex items-center gap-3 mt-2">
        <div className="flex-1 h-px bg-border-dim" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-text-3">Life Goals</span>
        <div className="flex-1 h-px bg-border-dim" />
      </div>

      <div className="animate-fade-up stagger-6 flex flex-col gap-3">
        {loadingGoals ? (
          <p className="text-[12px] text-text-3 text-center py-4">Loading from Notion…</p>
        ) : goalsError ? (
          <div className="px-4 py-3 rounded-[12px] bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)]">
            <p className="text-[11px] uppercase tracking-widest text-danger font-700 mb-1">Notion error</p>
            <p className="text-[12px] text-danger break-all">{goalsError}</p>
          </div>
        ) : lifeGoals.length === 0 ? (
          <div className="glass p-4 text-center">
            <p className="text-[12px] text-text-3">
              No life goals in Notion yet. Add some to the <span className="text-accent">🥅 Goals</span> database.
            </p>
          </div>
        ) : lifeGoals.map(goal => (
          <LifeGoalCard key={goal.id} goal={goal} />
        ))}
      </div>
    </div>
  );
}
