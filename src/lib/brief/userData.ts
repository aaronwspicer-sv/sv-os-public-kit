// Owner-specific data pulled from Notion + Supabase for the briefing.
// All queries are server-side via the service-role-equivalent admin clients
// (no user session — cron runs outside any session).
import { notion, DB, resolveDataSourceId } from "@/lib/notion";
import { createClient } from "@supabase/supabase-js";
import { config } from "@/config";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function torontoDate(iso?: string): string {
  return new Date(iso ?? Date.now()).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}

export interface DayLog {
  date: string;
  workout: boolean;
  nf: boolean;
  video: boolean;
  journal: boolean;
  hours: number;
  views: number;
  summary: string;
  mindset: string;
}

export interface UserBriefData {
  todayDate: string;        // YYYY-MM-DD Toronto
  yesterdayDate: string;
  todayLog: DayLog | null;       // today's entry if exists
  yesterdayLog: DayLog | null;
  oneYearAgoLog: DayLog | null;  // "on this day" memory
  streaks: { workout: number; nf: number; video: number; journal: number };
  longestWorkoutEver: number;
  todosOpen: { id: string; text: string }[];
  todosOpenCount: number;
  weekSpend: number;
  weekIncome: number;
  unreviewedTxCount: number;
  videosPipeline: Record<string, number>; // Idea / Scripting / Filming / Editing / Posted
  netWorthEstimate: number | null;
  weekHours: number;
  monthVideos: number;
}

function parseLog(p: any): DayLog | null {
  if (!p?.properties) return null;
  const date = new Date(p.created_time).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  return {
    date,
    workout: !!p.properties["Workout"]?.checkbox,
    nf:      !!p.properties["NF"]?.checkbox,
    video:   !!p.properties["📹 Posted 1 Video or Reel?"]?.checkbox,
    journal: !!p.properties["✍️ Reflected in Journal?"]?.checkbox,
    hours:   p.properties["⏳ Hours Worked"]?.number ?? 0,
    views:   p.properties["Daily Views "]?.number ?? 0,
    summary: p.properties["🏁 Summary of Day"]?.rich_text?.[0]?.plain_text ?? "",
    mindset: p.properties["🧠 Mindset Notes"]?.rich_text?.[0]?.plain_text ?? "",
  };
}

export async function gatherUserData(userId: string): Promise<UserBriefData> {
  const sb = admin();
  const today = torontoDate();
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });

  // ── Logs: pull last 400 entries for streaks + recent + one-year-ago ──
  // DB.LOG is a database ID; the query API needs a data source ID.
  const logDsId = await resolveDataSourceId(DB.LOG).catch(() => DB.LOG);
  const logResults = await notion.dataSources.query({
    data_source_id: logDsId,
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 400,
  }).catch(() => ({ results: [] as any[] }));

  const allLogs = (logResults.results as any[]).map(parseLog).filter(Boolean) as DayLog[];
  const byDate = new Map<string, DayLog>();
  for (const l of allLogs) {
    const e = byDate.get(l.date);
    if (!e) byDate.set(l.date, l);
    else byDate.set(l.date, {
      ...e,
      workout: e.workout || l.workout,
      nf:      e.nf      || l.nf,
      video:   e.video   || l.video,
      journal: e.journal || l.journal,
      hours:   e.hours + l.hours,
      views:   e.views + l.views,
    });
  }
  const todayLog     = byDate.get(today) ?? null;
  const yesterdayLog = byDate.get(yesterday) ?? null;

  // One year ago
  const oneYearAgoDate = (() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  })();
  const oneYearAgoLog = byDate.get(oneYearAgoDate) ?? null;

  // ── Streaks (active, ending today or yesterday) ──
  function streak(key: keyof DayLog): number {
    const done = new Set([...byDate.values()].filter(d => d[key]).map(d => d.date));
    let n = 0;
    const cur = new Date(`${today}T12:00:00Z`);
    for (let i = 0; i < 365; i++) {
      const ymd = cur.toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
      if (done.has(ymd)) n++;
      else if (i > 0) break;
      cur.setUTCDate(cur.getUTCDate() - 1);
    }
    return n;
  }
  const streaks = {
    workout: streak("workout"),
    nf:      streak("nf"),
    video:   streak("video"),
    journal: streak("journal"),
  };

  // Longest workout streak ever (for "new record" detection)
  let longestWorkoutEver = 0, run = 0, prev: string | null = null;
  const sorted = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const d of sorted) {
    if (!d.workout) { run = 0; prev = d.date; continue; }
    if (prev) {
      const diff = Math.round((new Date(d.date).getTime() - new Date(prev).getTime()) / 86400000);
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    if (run > longestWorkoutEver) longestWorkoutEver = run;
    prev = d.date;
  }

  // ── Todos for today ──
  const { data: todoRows } = await sb
    .from("daily_todos")
    .select("id, text, done")
    .eq("user_id", userId)
    .eq("date", today)
    .eq("done", false);
  const todosOpen = (todoRows ?? []).map((t: any) => ({ id: t.id, text: t.text })).slice(0, 5);

  // ── Week spend + income (last 7 days from Notion ledger) ──
  const weekStart = new Date(Date.now() - 7 * 86400000).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  const ledgerDsId = await resolveDataSourceId(DB.LEDGER).catch(() => DB.LEDGER);
  const ledger = await notion.dataSources.query({
    data_source_id: ledgerDsId,
    filter: { property: "Date", date: { on_or_after: weekStart } } as never,
    page_size: 200,
  }).catch(() => ({ results: [] as any[] }));
  let weekSpend = 0, weekIncome = 0;
  for (const p of (ledger.results as any[])) {
    const amt = p.properties?.["Amount"]?.number ?? 0;
    const type = p.properties?.["Transaction Type"]?.select?.name ?? "";
    if (type === "Income") weekIncome += amt;
    else if (type === "Expense" || type === "Tax Payment") weekSpend += amt;
  }

  // ── Unreviewed bank transactions (Flinks; Plaid table kept-but-unused
  //    during the cutover, see commit 4/4) ──
  const { count: unreviewedTxCount } = await sb
    .from("bank_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("confirmed_at", null);

  // ── Videos pipeline ──
  const videosDsId = await resolveDataSourceId(DB.VIDEOS).catch(() => DB.VIDEOS);
  const videos = await notion.dataSources.query({
    data_source_id: videosDsId,
    page_size: 200,
  }).catch(() => ({ results: [] as any[] }));
  const pipeline: Record<string, number> = { Idea: 0, Scripting: 0, Filming: 0, Editing: 0, Live: 0 };
  let monthVideos = 0;
  const monthPrefix = today.slice(0, 7);
  for (const p of (videos.results as any[])) {
    const st = p.properties?.["Status"]?.select?.name ?? "";
    if (pipeline[st] !== undefined) pipeline[st]++;
    const pub = p.properties?.["Publish Date"]?.date?.start ?? "";
    if (st === "Live" && pub.startsWith(monthPrefix)) monthVideos++;
  }

  // ── Net worth (Flinks + manual accounts) ──
  let netWorth: number | null = null;
  try {
    const { data: bank } = await sb
      .from("bank_accounts")
      .select("balance, category")
      .eq("user_id", userId);
    const { data: manual } = await sb.from("manual_accounts").select("balance, account_type").eq("user_id", userId);
    let nw = 0;
    for (const a of (bank ?? [])) {
      // bank_accounts.category enum: 'checking' | 'savings' | 'credit_card'
      //                              | 'loan' | 'investment' | 'insurance'
      // credit_card + loan subtract from net worth (they're liabilities).
      const cat = String(a.category ?? "").toLowerCase();
      const sign = (cat === "credit_card" || cat === "loan") ? -1 : 1;
      nw += sign * Number(a.balance ?? 0);
    }
    for (const a of (manual ?? [])) {
      const sign = String(a.account_type ?? "").toLowerCase().includes("liab") ? -1 : 1;
      nw += sign * Number(a.balance ?? 0);
    }
    netWorth = nw;
  } catch {}

  // ── Hours this week (sum log hours over last 7 days) ──
  let weekHours = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() - i * 86400000).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    weekHours += byDate.get(d)?.hours ?? 0;
  }

  return {
    todayDate: today,
    yesterdayDate: yesterday,
    todayLog,
    yesterdayLog,
    oneYearAgoLog,
    streaks,
    longestWorkoutEver,
    todosOpen,
    todosOpenCount: todoRows?.length ?? 0,
    weekSpend: Math.round(weekSpend * 100) / 100,
    weekIncome: Math.round(weekIncome * 100) / 100,
    unreviewedTxCount: unreviewedTxCount ?? 0,
    videosPipeline: pipeline,
    netWorthEstimate: netWorth != null ? Math.round(netWorth) : null,
    weekHours: Math.round(weekHours * 10) / 10,
    monthVideos,
  };
}
