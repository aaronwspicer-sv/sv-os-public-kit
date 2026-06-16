"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatDate } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { demoLifeGoalTitle } from "@/lib/demoMode";

function LifeGoalCard({ goal, index }: { goal: { title: string; target: number; current: number; status: string; priority: string; dueDate?: string }; index: number }) {
  const { isDemoMode } = useDemoMode();
  const dCurrent  = isDemoMode ? 47832 : goal.current;
  const dTarget   = isDemoMode ? 250000 : goal.target;
  const pct       = dTarget > 0 ? Math.min(100, (dCurrent / dTarget) * 100) : 0;
  const remaining = dTarget - dCurrent;
  const priorityVariant = goal.priority === "High" ? "danger" : goal.priority === "Medium" ? "warning" : "muted";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[14px] font-600 text-text-1">{isDemoMode ? demoLifeGoalTitle(index) : goal.title}</p>
        <Badge variant={priorityVariant as never}>{goal.priority}</Badge>
      </div>
      <ProgressBar value={pct} color="accent" />
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-text-3">
          <span className="text-text-1 font-700 tabular-nums font-mono">${dCurrent.toLocaleString("en-CA")}</span>
          <span className="text-text-3"> / ${dTarget.toLocaleString("en-CA")} CAD</span>
        </span>
        <span className="text-text-3">${remaining.toLocaleString("en-CA")} left</span>
      </div>
      {goal.dueDate && <p className="text-[11px] text-text-3">Due {formatDate(goal.dueDate)}</p>}
    </Card>
  );
}

interface LifeGoal { id: string; title: string; target: number; current: number; status: string; priority: string; dueDate?: string; }

export default function GoalsPage() {
  const { isDemoMode } = useDemoMode();
  const [lifeGoals, setLifeGoals]   = useState<LifeGoal[]>([]);
  const [loadingGoals, setLoading]  = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setLifeGoals(Array.from({ length: 3 }, (_, i) => ({ id: `lg${i}`, title: demoLifeGoalTitle(i), current: 0, target: 100 })) as any);
      setLoading(false);
      return;
    }
    fetch("/api/notion/goals")
      .then(async r => {
        const data = await r.json();
        if (!r.ok || data.error) { setGoalsError(data.error ?? "Failed to load life goals"); return; }
        if (data.goals) setLifeGoals(data.goals);
      })
      .catch(e => setGoalsError(e?.message ?? "Network error"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-up stagger-1">
        <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Goals</p>
        <h1 className="text-[24px] font-700 tracking-tight">Life Goals</h1>
        <p className="text-text-3 text-[13px] mt-1">The long game, pulled from Notion. Planning today &amp; tomorrow lives on{" "}
          <Link href="/d/entry" className="text-accent underline">Daily Entry</Link>.
        </p>
      </div>

      <div className="animate-fade-up stagger-2 flex flex-col gap-3">
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
        ) : lifeGoals.map((goal, i) => (
          <LifeGoalCard key={goal.id} goal={goal} index={i} />
        ))}
      </div>
    </div>
  );
}
