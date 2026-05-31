// Live OS-state snapshot injected into Alfred's system prompt every turn.
// This is what makes him grounded — he never has to ASK what your streak is,
// he already knows. Reuses the briefing data layer (single source of truth).
import { gatherUserData } from "@/lib/brief/userData";
import { createClient } from "@supabase/supabase-js";
import { getEventsForDate, getUpcomingEvents } from "@/lib/calendar";
import { torontoTodayBounds, torontoDay } from "@/lib/torontoDay";
import { config } from "@/config";

function adminSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function buildLiveSnapshot(userId: string): Promise<string> {
  const sb = adminSb();
  const [d, todayEvents, nextEvents] = await Promise.all([
    gatherUserData(userId),
    getEventsForDate(sb, userId, torontoTodayBounds().label).catch(() => []),
    getUpcomingEvents(sb, userId, 7).catch(() => []),
  ]);

  const torontoTime = new Date().toLocaleString("en-CA", {
    timeZone: config.locale.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  const habitsToday = d.todayLog
    ? `${[d.todayLog.workout && "Workout", d.todayLog.nf && "NF", d.todayLog.video && "Video", d.todayLog.journal && "Journal"].filter(Boolean).join(", ") || "none yet"}`
    : "no log entry yet today";

  const todoList = d.todosOpen.length === 0
    ? "  (none)"
    : d.todosOpen.slice(0, 5).map((t, i) => `  ${i + 1}. ${t.text}`).join("\n");

  const pipeline = Object.entries(d.videosPipeline)
    .filter(([_, n]) => n > 0)
    .map(([k, n]) => `${k} ${n}`)
    .join(" · ") || "empty";

  return `
=== LIVE OS STATE (auto-refreshed each turn) ===
Now: ${torontoTime}
Today's date: ${d.todayDate}

TODAY'S LOG
- Habits done today: ${habitsToday}
- Hours worked today: ${d.todayLog?.hours ?? 0}h
- Today's views logged: ${d.todayLog?.views ?? 0}
${d.todayLog?.summary ? `- Summary line: "${d.todayLog.summary}"` : ""}

ACTIVE STREAKS (consecutive days)
- Workout: ${d.streaks.workout}d (longest ever ${d.longestWorkoutEver}d)
- NF: ${d.streaks.nf}d
- Video: ${d.streaks.video}d
- Journal: ${d.streaks.journal}d

THIS WEEK
- Hours worked: ${d.weekHours}h
- Money spent: $${d.weekSpend.toLocaleString()}
- Money earned: $${d.weekIncome.toLocaleString()}
- Videos shipped this month: ${d.monthVideos}

OPEN TODOS TODAY (${d.todosOpenCount} total)
${todoList}

CONTENT PIPELINE
${pipeline}

CALENDAR — TODAY (${todayEvents.length} events)
${todayEvents.length === 0
  ? "  (nothing scheduled)"
  : todayEvents.slice(0, 8).map(e => {
      const when = e.allDay ? "all-day" : new Date(e.start).toLocaleTimeString("en-US", { timeZone: config.locale.timezone, hour: "numeric", minute: "2-digit" });
      const cal = e.source ? ` [${e.source}]` : "";
      const loc = e.location ? ` @ ${e.location}` : "";
      return `  ${when} — ${e.title}${loc}${cal}`;
    }).join("\n")}

CALENDAR — NEXT 7 DAYS (${nextEvents.length} upcoming, showing next 6)
${nextEvents.length === 0
  ? "  (clear)"
  : nextEvents.filter(e => torontoDay(e.start) !== torontoTodayBounds().label).slice(0, 6).map(e => {
      const when = e.allDay
        ? `${torontoDay(e.start)} all-day`
        : new Date(e.start).toLocaleString("en-US", { timeZone: config.locale.timezone, weekday: "short", hour: "numeric", minute: "2-digit" });
      const cal = e.source ? ` [${e.source}]` : "";
      return `  ${when} — ${e.title}${cal}`;
    }).join("\n")}

MONEY PULSE
- Unreviewed Plaid transactions: ${d.unreviewedTxCount}
- Net worth estimate: ${d.netWorthEstimate != null ? `$${d.netWorthEstimate.toLocaleString()}` : "—"}

YESTERDAY (${d.yesterdayDate})
${d.yesterdayLog
  ? `- ${[d.yesterdayLog.workout, d.yesterdayLog.nf, d.yesterdayLog.video, d.yesterdayLog.journal].filter(Boolean).length}/4 habits, ${d.yesterdayLog.hours}h worked${d.yesterdayLog.summary ? `, summary: "${d.yesterdayLog.summary}"` : ""}`
  : "- No log entry"}

ONE YEAR AGO TODAY
${d.oneYearAgoLog
  ? `- ${[d.oneYearAgoLog.workout, d.oneYearAgoLog.nf, d.oneYearAgoLog.video, d.oneYearAgoLog.journal].filter(Boolean).length}/4 habits, ${d.oneYearAgoLog.hours}h${d.oneYearAgoLog.summary ? `, summary: "${d.oneYearAgoLog.summary}"` : ""}`
  : "- No entry from one year ago"}
=== END OS STATE ===
`.trim();
}
