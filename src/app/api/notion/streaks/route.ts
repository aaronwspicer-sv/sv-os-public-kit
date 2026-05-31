import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";
import { config } from "@/config";

function calcStreak(dates: string[], habit: string, rows: any[]): number {
  // Build a set of dates where this habit was true
  const doneDates = new Set(
    rows
      .filter(r => r.props[habit]?.checkbox === true)
      .map(r => r.date)
  );

  // Walk backwards from yesterday counting consecutive days
  let streak = 0;
  const today = new Date();
  // Start from today (if logged) or yesterday
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (doneDates.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      // Allow today to be missing (not yet logged)
      break;
    }
  }
  return streak;
}

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    // Fetch last 90 days of log entries using created_time (canonical date in Log DB)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffIso = cutoff.toISOString();

    const response = await notion.dataSources.query({
      data_source_id: DB.LOG,
      filter: {
        timestamp: "created_time",
        created_time: { on_or_after: cutoffIso },
      } as never,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 90,
    });

    const rows = response.results.map((page: any) => ({
      // Use page.created_time (top-level), convert to YYYY-MM-DD in Toronto
      date: new Date(page.created_time ?? "").toLocaleDateString("en-CA", { timeZone: config.locale.timezone }),
      props: page.properties,
    }));

    const streaks = {
      workout: calcStreak([], "Workout", rows),
      video:   calcStreak([], "📹 Posted 1 Video or Reel?", rows),
      journal: calcStreak([], "✍️ Reflected in Journal?", rows),
      nf:      calcStreak([], "NF", rows),
    };

    return NextResponse.json({ streaks });
  } catch (error: any) {
    console.error("Streaks error:", error);
    return NextResponse.json({ streaks: { workout: 0, video: 0, journal: 0, nf: 0 } });
  }
}
