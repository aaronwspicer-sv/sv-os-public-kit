import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { isVaultUnlocked } from "@/lib/financeVault";
import { notion, DB } from "@/lib/notion";
import { config } from "@/config";

// GET /api/timeline/events?year=YYYY
// Aggregates all life events for the year across:
//   • Notion Log         → journal entries
//   • Notion SV Videos   → published videos
//   • Notion Ledger      → notable transactions
//   • Notion Goals       → status flips to Funded / Achieved
//   • Supabase photos    → iCloud-imported photos
//   • Computed milestones → streak hits, peak days
// Returns events sorted by datetime desc.

interface TimelineEvent {
  id: string;
  date: string;           // YYYY-MM-DD (Toronto)
  datetime: string;       // ISO
  type: "journal" | "video" | "money" | "milestone" | "photo" | "goal";
  title: string;
  body?: string;
  thumbnail?: string;
  link?: string;
  meta?: Record<string, any>;
}

const TX_NOTABLE_THRESHOLD = 200; // CAD — only show transactions ≥ this on timeline

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  // Ledger events are only included when the finance vault is unlocked.
  // Other timeline data (journal/video/photo/milestone/goal) still loads.
  const vault = await isVaultUnlocked(user.id);
  const showFinance = vault.unlocked;

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  const yearStr = String(year);
  // Query a wider window (±1 day) because UTC boundaries don't match Toronto boundaries.
  const startIso = `${year - 1}-12-30T00:00:00.000Z`;
  const endIso   = `${year + 1}-01-02T23:59:59.999Z`;
  const startDate = `${year - 1}-12-30`;
  const endDate   = `${year + 1}-01-02`;

  const [logEntries, videos, ledger, goals, photosRes] = await Promise.all([
    notion.dataSources.query({
      data_source_id: DB.LOG,
      filter: { timestamp: "created_time", created_time: { on_or_after: startIso, on_or_before: endIso } } as never,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 400,
    }).catch(() => ({ results: [] as any[] })),

    notion.dataSources.query({
      data_source_id: DB.VIDEOS,
      page_size: 200,
    }).catch(() => ({ results: [] as any[] })),

    // Ledger query is skipped when vault is locked
    showFinance
      ? notion.dataSources.query({
          data_source_id: DB.LEDGER,
          filter: { property: "Date", date: { on_or_after: startDate, on_or_before: endDate } } as never,
          page_size: 500,
        }).catch(() => ({ results: [] as any[] }))
      : Promise.resolve({ results: [] as any[] }),

    notion.dataSources.query({
      data_source_id: DB.GOALS,
      page_size: 100,
    }).catch(() => ({ results: [] as any[] })),

    supabase.from("timeline_photos")
      .select("*")
      .eq("user_id", user.id)
      .gte("taken_at", startIso)
      .lte("taken_at", endIso)
      .order("taken_at", { ascending: false }),
  ]);

  const events: TimelineEvent[] = [];

  // ── Journal entries ─────────────────────────────────────────
  const habitTotals: Record<string, number> = { workout: 0, nf: 0, postedVideo: 0, reflectedJournal: 0 };
  const habitStreaks: Record<string, { current: number; best: number; bestEndDate: string }> = {
    workout: { current: 0, best: 0, bestEndDate: "" },
    nf: { current: 0, best: 0, bestEndDate: "" },
    postedVideo: { current: 0, best: 0, bestEndDate: "" },
    reflectedJournal: { current: 0, best: 0, bestEndDate: "" },
  };
  const peakHoursDay = { date: "", hours: 0 };
  const peakViewsDay = { date: "", views: 0 };
  const STREAK_MILESTONES = [7, 30, 100, 365];

  // Sort log entries by date ascending for streak computation
  const logsAsc = [...logEntries.results].sort((a: any, b: any) => (a.created_time ?? "").localeCompare(b.created_time ?? ""));
  let prevDate: string | null = null;

  for (const page of logsAsc as any[]) {
    const props = page.properties ?? {};
    const ymd = new Date(page.created_time).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    const summary  = props["🏁 Summary of Day"]?.rich_text?.[0]?.plain_text ?? "";
    const mindset  = props["🧠 Mindset Notes"]?.rich_text?.[0]?.plain_text ?? "";
    const hours    = props["⏳ Hours Worked"]?.number ?? 0;
    const views    = props["Daily Views "]?.number ?? 0;
    const habits = {
      workout: !!props["Workout"]?.checkbox,
      nf: !!props["NF"]?.checkbox,
      postedVideo: !!props["📹 Posted 1 Video or Reel?"]?.checkbox,
      reflectedJournal: !!props["✍️ Reflected in Journal?"]?.checkbox,
    };

    // Journal card if there's content
    if (summary || mindset) {
      events.push({
        id: `journal-${page.id}`,
        date: ymd,
        datetime: page.created_time,
        type: "journal",
        title: summary ? truncate(summary, 80) : "Mindset note",
        body: [summary, mindset].filter(Boolean).join("\n\n"),
        link: page.url,
        meta: { habits, hours, views },
      });
    }

    // Track totals + streaks
    for (const key of Object.keys(habits) as (keyof typeof habits)[]) {
      if (habits[key]) habitTotals[key]++;
      const s = habitStreaks[key];
      const dayGap = prevDate ? Math.round((new Date(ymd).getTime() - new Date(prevDate).getTime()) / (1000*60*60*24)) : 1;
      if (habits[key] && dayGap === 1) {
        s.current += 1;
      } else if (habits[key]) {
        s.current = 1;
      } else {
        s.current = 0;
      }
      if (s.current > s.best) { s.best = s.current; s.bestEndDate = ymd; }
    }
    prevDate = ymd;

    if (hours > peakHoursDay.hours) { peakHoursDay.hours = hours; peakHoursDay.date = ymd; }
    if (views > peakViewsDay.views) { peakViewsDay.views = views; peakViewsDay.date = ymd; }
  }

  // ── Streak milestones (emit when habit streak crosses a threshold) ─
  // Re-walk for milestone detection
  const milestoneTracker: Record<string, Set<number>> = {
    workout: new Set(), nf: new Set(), postedVideo: new Set(), reflectedJournal: new Set(),
  };
  const habitLabels: Record<string, { emoji: string; label: string }> = {
    workout:          { emoji: "💪", label: "Workout" },
    nf:               { emoji: "🔥", label: "NF" },
    postedVideo:      { emoji: "📹", label: "Posted video" },
    reflectedJournal: { emoji: "✍️", label: "Journal" },
  };

  const streakRun: Record<string, number> = { workout: 0, nf: 0, postedVideo: 0, reflectedJournal: 0 };
  prevDate = null;
  for (const page of logsAsc as any[]) {
    const props = page.properties ?? {};
    const ymd = new Date(page.created_time).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    const habits = {
      workout: !!props["Workout"]?.checkbox,
      nf: !!props["NF"]?.checkbox,
      postedVideo: !!props["📹 Posted 1 Video or Reel?"]?.checkbox,
      reflectedJournal: !!props["✍️ Reflected in Journal?"]?.checkbox,
    };
    const dayGap = prevDate ? Math.round((new Date(ymd).getTime() - new Date(prevDate).getTime()) / (1000*60*60*24)) : 1;
    for (const key of Object.keys(habits) as (keyof typeof habits)[]) {
      if (habits[key] && dayGap === 1) streakRun[key] += 1;
      else if (habits[key]) streakRun[key] = 1;
      else streakRun[key] = 0;

      for (const m of STREAK_MILESTONES) {
        if (streakRun[key] === m && !milestoneTracker[key].has(m)) {
          milestoneTracker[key].add(m);
          events.push({
            id: `milestone-streak-${key}-${m}-${ymd}`,
            date: ymd,
            datetime: page.created_time,
            type: "milestone",
            title: `${habitLabels[key].emoji} ${m}-day ${habitLabels[key].label} streak`,
            body: `Hit ${m} consecutive days.`,
            meta: { habit: key, days: m },
          });
        }
      }
    }
    prevDate = ymd;
  }

  // Peak hours / views (as milestones)
  if (peakHoursDay.hours > 0) {
    events.push({
      id: `milestone-peak-hours-${peakHoursDay.date}`,
      date: peakHoursDay.date,
      datetime: `${peakHoursDay.date}T23:00:00.000Z`,
      type: "milestone",
      title: `🏔️ Peak day · ${peakHoursDay.hours}h worked`,
      body: "Hardest grind of the year so far.",
      meta: { hours: peakHoursDay.hours },
    });
  }
  if (peakViewsDay.views > 0) {
    events.push({
      id: `milestone-peak-views-${peakViewsDay.date}`,
      date: peakViewsDay.date,
      datetime: `${peakViewsDay.date}T22:00:00.000Z`,
      type: "milestone",
      title: `🚀 Peak views · ${formatViews(peakViewsDay.views)}`,
      body: "Biggest single-day audience.",
      meta: { views: peakViewsDay.views },
    });
  }

  // ── Videos published ────────────────────────────────────────
  for (const page of videos.results as any[]) {
    const props = page.properties ?? {};
    const status = props["Status"]?.select?.name ?? "";
    if (status !== "Live") continue;
    const publishDate = props["Publish Date"]?.date?.start ?? "";
    if (!publishDate || !publishDate.startsWith(String(year))) continue;
    const title = props["Title"]?.title?.[0]?.plain_text ?? "Untitled";
    const pillar = props["Content Pillar"]?.select?.name ?? "Journey";
    const type   = props["Type"]?.select?.name ?? "Long Form";
    const views  = props["Views"]?.number ?? 0;
    const thumb  = props["Thumbnail"]?.url ?? null;
    events.push({
      id: `video-${page.id}`,
      date: publishDate.split("T")[0],
      datetime: publishDate.includes("T") ? publishDate : `${publishDate}T12:00:00.000Z`,
      type: "video",
      title: `🎬 ${title}`,
      body: `${pillar} · ${type}${views > 0 ? ` · ${formatViews(views)} views` : ""}`,
      thumbnail: thumb && !thumb.includes("icloud") ? thumb : undefined,
      link: page.url,
      meta: { pillar, type, views },
    });
  }

  // ── Notable transactions ────────────────────────────────────
  for (const page of ledger.results as any[]) {
    const props = page.properties ?? {};
    const amount = props["Amount"]?.number ?? 0;
    if (Math.abs(amount) < TX_NOTABLE_THRESHOLD) continue;
    const txType  = props["Transaction Type"]?.select?.name ?? "";
    if (txType === "Transfer" || txType === "Bank Move" || txType === "Pot Move") continue; // boring
    const name = props["Name"]?.title?.[0]?.plain_text ?? "Transaction";
    const category = props["Category"]?.select?.name ?? "";
    const date = props["Date"]?.date?.start ?? "";
    if (!date) continue;
    const isIncome = txType === "Income";
    events.push({
      id: `money-${page.id}`,
      date: date.split("T")[0],
      datetime: date.includes("T") ? date : `${date}T12:00:00.000Z`,
      type: "money",
      title: `${isIncome ? "💰" : "🧾"} ${name}`,
      body: `${isIncome ? "+" : "-"}$${Math.abs(amount).toLocaleString("en-CA")} · ${category}`,
      meta: { amount, category, type: txType },
    });
  }

  // ── Goals funded / achieved ─────────────────────────────────
  for (const page of goals.results as any[]) {
    const props = page.properties ?? {};
    const status = props["Status"]?.status?.name ?? "";
    if (status !== "Funded" && status !== "Achieved") continue;
    // Use last_edited_time as proxy for when it was funded
    const editedYmd = new Date(page.last_edited_time).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    if (!editedYmd.startsWith(String(year))) continue;
    const title = props["Goal"]?.title?.[0]?.plain_text ?? "Goal";
    const target = props["Target (CAD)"]?.number ?? 0;
    events.push({
      id: `goal-${page.id}`,
      date: editedYmd,
      datetime: page.last_edited_time,
      type: "goal",
      title: `🥅 Goal ${status}: ${title}`,
      body: target > 0 ? `$${target.toLocaleString("en-CA")} target reached.` : undefined,
      link: page.url,
      meta: { status, target },
    });
  }

  // ── Photos ──────────────────────────────────────────────────
  for (const photo of (photosRes.data ?? [])) {
    const ymd = new Date(photo.taken_at).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
    events.push({
      id: `photo-${photo.id}`,
      date: ymd,
      datetime: photo.taken_at,
      type: "photo",
      title: photo.caption || (photo.place_name ? `📍 ${photo.place_name}` : "📸 Moment"),
      thumbnail: photo.thumbnail ?? photo.image_url ?? undefined,
      meta: { place: photo.place_name, lat: photo.latitude, lng: photo.longitude },
    });
  }

  // Trim to events whose Toronto-resolved date falls in the requested year.
  // (Each event's `date` field was set to Toronto YYYY-MM-DD during processing.)
  const yearEvents = events.filter(e => e.date.startsWith(yearStr));

  // Sort by datetime desc
  yearEvents.sort((a, b) => b.datetime.localeCompare(a.datetime));

  return NextResponse.json({
    year,
    events: yearEvents,
    financeLocked: !showFinance,
    counts: {
      total: yearEvents.length,
      journal:   yearEvents.filter(e => e.type === "journal").length,
      video:     yearEvents.filter(e => e.type === "video").length,
      money:     yearEvents.filter(e => e.type === "money").length,
      milestone: yearEvents.filter(e => e.type === "milestone").length,
      photo:     yearEvents.filter(e => e.type === "photo").length,
      goal:      yearEvents.filter(e => e.type === "goal").length,
    },
    totals: { habitTotals },
  });
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function formatViews(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
