// Proactive alert checker — called client-side every few minutes.
// Returns alerts Alfred should surface as browser notifications.
// Checks: streak break risk, upcoming calendar events, new transactions.
import { NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { gatherUserData } from "@/lib/brief/userData";
import { getEventsForDate } from "@/lib/calendar";
import { config } from "@/config";

export const runtime = "nodejs";
export const maxDuration = 20;

function torontoNow() {
  return new Date().toLocaleString("en-US", { timeZone: config.locale.timezone });
}
function torontoToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}
function torontoHour() {
  return new Date().toLocaleString("en-US", { timeZone: config.locale.timezone, hour: "numeric", hour12: false });
}

export interface ProactiveAlert {
  id: string;         // stable key so client can dedupe
  kind: "streak" | "calendar" | "finance" | "nudge";
  title: string;
  body: string;
  urgent: boolean;
}

export async function GET() {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;

  const alerts: ProactiveAlert[] = [];

  try {
    const [data, events] = await Promise.all([
      gatherUserData(gate.user.id),
      getEventsForDate(gate.supabase, gate.user.id, torontoToday()).catch(() => []),
    ]);

    const hour = parseInt(torontoHour(), 10);
    const now  = Date.now();

    // ── Streak break risk ──────────────────────────────────────
    // Only warn in the evening (after 7pm) when habits still incomplete
    if (hour >= 19) {
      const { streaks } = data;
      const todayLog = data.todayLog as any;
      const habits = [
        { key: "workout",         label: "Workout",  streak: streaks?.workout  ?? 0, done: !!todayLog?.workout },
        { key: "nf",              label: "NF",       streak: streaks?.nf       ?? 0, done: !!todayLog?.nf },
        { key: "video",           label: "Video",    streak: streaks?.video    ?? 0, done: !!todayLog?.video },
        { key: "journal",         label: "Journal",  streak: streaks?.journal  ?? 0, done: !!todayLog?.journal },
      ];
      for (const h of habits) {
        if (!h.done && h.streak > 0) {
          alerts.push({
            id: `streak-${h.key}-${torontoToday()}`,
            kind: "streak",
            title: `${h.label} streak at risk`,
            body: `${h.streak}-day streak breaks tonight if you don't log it. ${hour >= 22 ? "Last chance." : "Still time."}`,
            urgent: h.streak >= 7 || hour >= 22,
          });
        }
      }
    }

    // ── Upcoming calendar events (next 20 min) ─────────────────
    const upcoming = events.filter(e => {
      if (e.allDay) return false;
      const start = new Date(e.start).getTime();
      const diff = start - now;
      return diff > 0 && diff <= 20 * 60 * 1000;
    });
    for (const e of upcoming) {
      const minAway = Math.round((new Date(e.start).getTime() - now) / 60_000);
      alerts.push({
        id: `cal-${e.title}-${e.start}`,
        kind: "calendar",
        title: `${e.title} in ${minAway} min`,
        body: e.location ? `📍 ${e.location}` : "Check your calendar.",
        urgent: minAway <= 5,
      });
    }

    // ── Unreviewed transactions ────────────────────────────────
    const txCount = data.unreviewedTxCount ?? 0;
    if (txCount >= 5) {
      alerts.push({
        id: `tx-unreviewed-${txCount}`,
        kind: "finance",
        title: `${txCount} transactions need review`,
        body: "Open Finances to categorize them.",
        urgent: txCount >= 15,
      });
    }

  } catch (err: any) {
    console.error("proactive check failed:", err?.message);
  }

  return NextResponse.json({ alerts, checkedAt: new Date().toISOString() });
}
