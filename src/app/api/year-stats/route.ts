import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { notion, DB } from "@/lib/notion";
import { PILLARS, normalizePillar } from "@/lib/pillars";
import { config } from "@/config";

// GET /api/year-stats?year=2026
// Aggregate annual stats + daily heatmap + monthly breakdowns for charts.

export async function GET(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const yearStr = String(year);
  // Wider UTC window — we filter by Toronto-resolved YYYY-MM-DD downstream
  // so timezone offset doesn't drag adjacent-year entries into the bucket.
  const startIso = `${year - 1}-12-30T00:00:00.000Z`;
  const endIso   = `${year + 1}-01-02T23:59:59.999Z`;

  const [logEntries, ledgerEntries, videos, todos] = await Promise.all([
    notion.dataSources.query({
      data_source_id: DB.LOG,
      filter: { timestamp: "created_time", created_time: { on_or_after: startIso, on_or_before: endIso } } as never,
      page_size: 400,
    }).catch(() => ({ results: [] as any[] })),
    notion.dataSources.query({
      data_source_id: DB.LEDGER,
      filter: { property: "Date", date: { on_or_after: `${year - 1}-12-30`, on_or_before: `${year + 1}-01-02` } } as never,
      page_size: 500,
    }).catch(() => ({ results: [] as any[] })),
    notion.dataSources.query({
      data_source_id: DB.VIDEOS,
      page_size: 200,
    }).catch(() => ({ results: [] as any[] })),
    supabase.from("daily_todos")
      .select("date, done")
      .eq("user_id", user.id)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`),
  ]);

  // ── Log rows (one per day) — filtered to Toronto-year ───────
  const logRows = (logEntries.results as any[])
    .map(p => ({
      date: new Date(p.created_time).toLocaleDateString("en-CA", { timeZone: config.locale.timezone }),
      workout: !!p.properties?.["Workout"]?.checkbox,
      nf: !!p.properties?.["NF"]?.checkbox,
      postedVideo: !!p.properties?.["📹 Posted 1 Video or Reel?"]?.checkbox,
      reflectedJournal: !!p.properties?.["✍️ Reflected in Journal?"]?.checkbox,
      hours: p.properties?.["⏳ Hours Worked"]?.number ?? 0,
      views: p.properties?.["Daily Views "]?.number ?? 0,
    }))
    .filter(r => r.date.startsWith(yearStr));

  // Aggregate by date (in case of dup entries)
  const byDate = new Map<string, typeof logRows[number]>();
  for (const r of logRows) {
    const existing = byDate.get(r.date);
    if (!existing) byDate.set(r.date, r);
    else byDate.set(r.date, {
      ...existing,
      workout: existing.workout || r.workout,
      nf: existing.nf || r.nf,
      postedVideo: existing.postedVideo || r.postedVideo,
      reflectedJournal: existing.reflectedJournal || r.reflectedJournal,
      hours: existing.hours + r.hours,
      views: existing.views + r.views,
    });
  }

  // Daily heatmap data — full year of days
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const totalDays = isLeap(year) ? 366 : 365;
  const daily: { date: string; habitCount: number; hours: number; logged: boolean }[] = [];
  const dayCursor = new Date(Date.UTC(year, 0, 1));
  for (let i = 0; i < totalDays; i++) {
    const ymd = dayCursor.toISOString().split("T")[0];
    const entry = byDate.get(ymd);
    daily.push({
      date: ymd,
      habitCount: entry ? [entry.workout, entry.nf, entry.postedVideo, entry.reflectedJournal].filter(Boolean).length : 0,
      hours: entry?.hours ?? 0,
      logged: !!entry,
    });
    dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
  }

  const totalDaysLogged = byDate.size;
  const allLogged = [...byDate.values()];
  const workoutDays = allLogged.filter(r => r.workout).length;
  const nfDays      = allLogged.filter(r => r.nf).length;
  const videoDays   = allLogged.filter(r => r.postedVideo).length;
  const journalDays = allLogged.filter(r => r.reflectedJournal).length;
  const totalHours  = allLogged.reduce((s, r) => s + r.hours, 0);
  const totalViewsLogged = allLogged.reduce((s, r) => s + r.views, 0);

  // ── Ledger — also filter to Toronto-year ────────────────────
  const ledgerRows = (ledgerEntries.results as any[])
    .map(p => {
      const props = p.properties ?? {};
      return {
        amount:   props["Amount"]?.number ?? 0,
        type:     props["Transaction Type"]?.select?.name ?? "",
        category: props["Category"]?.select?.name ?? "",
        date:     props["Date"]?.date?.start ?? "",
      };
    })
    .filter(r => r.date.startsWith(yearStr));
  const income  = ledgerRows.filter(r => r.type === "Income").reduce((s, r) => s + r.amount, 0);
  const expense = ledgerRows.filter(r => r.type === "Expense" || r.type === "Tax Payment").reduce((s, r) => s + r.amount, 0);
  const net = income - expense;
  const catTotals = new Map<string, number>();
  for (const r of ledgerRows) {
    if (r.type !== "Expense") continue;
    catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + r.amount);
  }
  const topCategories = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount }));

  // ── Content ─────────────────────────────────────────────────
  const videoRows = (videos.results as any[]).map(p => {
    const props = p.properties ?? {};
    return {
      status:      props["Status"]?.select?.name ?? "",
      pillar:      normalizePillar(props["Content Pillar"]?.select?.name),
      type:        props["Type"]?.select?.name ?? "",
      views:       props["Views"]?.number ?? 0,
      publishDate: props["Publish Date"]?.date?.start ?? "",
    };
  });
  const publishedThisYear = videoRows.filter(v => v.status === "Live" && v.publishDate.startsWith(String(year)));
  const longForm  = publishedThisYear.filter(v => v.type === "Long Form").length;
  const shortForm = publishedThisYear.filter(v => v.type !== "Long Form").length;
  const totalViews = publishedThisYear.reduce((s, v) => s + v.views, 0);
  const byPillar = PILLARS.map(p => ({
    pillar: p,
    count: publishedThisYear.filter(v => v.pillar === p).length,
    views: publishedThisYear.filter(v => v.pillar === p).reduce((s, v) => s + v.views, 0),
  }));

  // ── Monthly breakdowns for charts ───────────────────────────
  const months = Array.from({ length: 12 }, (_, i) => i);
  const monthly = months.map(m => {
    const monthStr = `${year}-${String(m + 1).padStart(2, "0")}`;
    const monthHours = allLogged.filter(r => r.date.startsWith(monthStr)).reduce((s, r) => s + r.hours, 0);
    const monthIncome = ledgerRows.filter(r => r.type === "Income" && r.date.startsWith(monthStr)).reduce((s, r) => s + r.amount, 0);
    const monthExpense = ledgerRows.filter(r => (r.type === "Expense" || r.type === "Tax Payment") && r.date.startsWith(monthStr)).reduce((s, r) => s + r.amount, 0);
    const monthPublished = publishedThisYear.filter(v => v.publishDate.startsWith(monthStr));
    const monthByPillar = PILLARS.reduce<Record<string, number>>((acc, p) => {
      acc[p] = monthPublished.filter(v => v.pillar === p).length;
      return acc;
    }, {});
    return {
      month: m + 1,
      hours: Math.round(monthHours * 10) / 10,
      income: Math.round(monthIncome * 100) / 100,
      expense: Math.round(monthExpense * 100) / 100,
      published: monthPublished.length,
      byPillar: monthByPillar,
    };
  });

  // ── Todos ───────────────────────────────────────────────────
  const todoData = todos.data ?? [];
  const totalTodos = todoData.length;
  const totalTodosDone = todoData.filter((t: any) => t.done).length;
  const completionRate = totalTodos > 0 ? Math.round((totalTodosDone / totalTodos) * 100) : 0;

  // ── Best day ────────────────────────────────────────────────
  const bestDay = allLogged
    .map(r => ({ ...r, score: [r.workout, r.nf, r.postedVideo, r.reflectedJournal].filter(Boolean).length * 2 + r.hours }))
    .sort((a, b) => b.score - a.score)[0];

  // ── Longest streaks (consecutive days where habit was true) ─
  function longestStreak(check: (r: typeof logRows[number]) => boolean): number {
    const sortedDates = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    let best = 0, current = 0, prevDate: string | null = null;
    for (const [date, row] of sortedDates) {
      if (!check(row)) { current = 0; prevDate = date; continue; }
      if (prevDate) {
        const prev = new Date(prevDate);
        const curr = new Date(date);
        const diff = Math.round((curr.getTime() - prev.getTime()) / (1000*60*60*24));
        current = diff === 1 ? current + 1 : 1;
      } else current = 1;
      if (current > best) best = current;
      prevDate = date;
    }
    return best;
  }

  const longestStreaks = {
    workout: longestStreak(r => r.workout),
    nf:      longestStreak(r => r.nf),
    video:   longestStreak(r => r.postedVideo),
    journal: longestStreak(r => r.reflectedJournal),
  };

  return NextResponse.json({
    year,
    log: {
      totalDaysLogged,
      workoutDays, nfDays, videoDays, journalDays,
      totalHours: Math.round(totalHours * 10) / 10,
      totalViewsLogged,
      bestDay: bestDay ? { date: bestDay.date, hours: bestDay.hours, habits: [bestDay.workout, bestDay.nf, bestDay.postedVideo, bestDay.reflectedJournal].filter(Boolean).length } : null,
      longestStreaks,
      daily,
    },
    money: {
      income:  Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      net:     Math.round(net * 100) / 100,
      topCategories,
    },
    content: {
      published: publishedThisYear.length,
      longForm, shortForm, totalViews, byPillar,
    },
    todos: { total: totalTodos, done: totalTodosDone, completionRate },
    monthly,
  });
}
