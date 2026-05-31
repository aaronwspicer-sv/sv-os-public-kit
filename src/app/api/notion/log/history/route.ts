import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";
import { config } from "@/config";

// Returns past Log entries newest-first, paginated via Notion's start_cursor.
// Each entry includes a Toronto YYYY-MM-DD `date` derived from created_time.

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 100);

  try {
    const response = await notion.dataSources.query({
      data_source_id: DB.LOG,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: limit,
      ...(cursor ? { start_cursor: cursor } : {}),
    } as never);

    const entries = response.results.map((page: any) => {
      const props = page.properties ?? {};
      const dateToronto = new Date(page.created_time ?? "")
        .toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
      return {
        id: page.id,
        date: dateToronto, // YYYY-MM-DD
        workout:          props["Workout"]?.checkbox ?? false,
        nf:               props["NF"]?.checkbox ?? false,
        postedVideo:      props["📹 Posted 1 Video or Reel?"]?.checkbox ?? false,
        reflectedJournal: props["✍️ Reflected in Journal?"]?.checkbox ?? false,
        hoursWorked:      props["⏳ Hours Worked"]?.number ?? 0,
        dailyViews:       props["Daily Views "]?.number ?? 0,
        summaryOfDay:     props["🏁 Summary of Day"]?.rich_text?.[0]?.plain_text ?? "",
        mindsetNotes:     props["🧠 Mindset Notes"]?.rich_text?.[0]?.plain_text ?? "",
      };
    });

    return NextResponse.json({
      entries,
      nextCursor: response.has_more ? response.next_cursor : null,
    });
  } catch (error: any) {
    console.error("Notion log history GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
