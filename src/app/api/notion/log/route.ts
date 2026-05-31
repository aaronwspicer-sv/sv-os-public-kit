import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB, resolveDataSourceId } from "@/lib/notion";
import { torontoTodayBounds } from "@/lib/torontoDay";

// The Log DB's title property displays as "Entry" in Notion. We set the title
// to today's YYYY-MM-DD label on every save, so the title acts as the
// deterministic key for "today's entry".
//
// IMPORTANT — Notion API 2025-09-03 quirk:
//   For a title-typed property, the filter MUST address it by the canonical
//   property ID `"title"`, NOT by the display name (`"Entry"`). Filtering by
//   the display name returns 0 results even on an exact text match. Verified
//   via direct API: `{property:"Entry", title:{equals:"2026-05-25"}}` → 0
//   results, `{property:"title", title:{equals:"2026-05-25"}}` → 1 result.
//
// We also do NOT fall back to a `timestamp:"created_time"` window — that
// filter is silently ignored under this API version (returns all rows
// regardless of bounds), which previously caused every save to overwrite
// the most-recently-edited page instead of creating a new one.
//
// "Daily Views " has a trailing space in the Notion schema.

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { label } = torontoTodayBounds();

  try {
    const logDsId = await resolveDataSourceId(DB.LOG);
    const response = await notion.dataSources.query({
      data_source_id: logDsId,
      // `property: "title"` is the canonical title-property ID — required.
      filter: { property: "title", title: { equals: label } } as never,
      page_size: 1,
    });

    if (response.results.length === 0) {
      // No entry titled `label` yet — return blank so the client can fall
      // back to its draft. POST will create the page on save.
      return NextResponse.json({ entry: null, dateLabel: label });
    }

    const page = response.results[0] as any;
    const props = page.properties;

    const entry = {
      notionPageId:     page.id,
      workout:          props["Workout"]?.checkbox ?? false,
      nf:               props["NF"]?.checkbox ?? false,
      postedVideo:      props["📹 Posted 1 Video or Reel?"]?.checkbox ?? false,
      reflectedJournal: props["✍️ Reflected in Journal?"]?.checkbox ?? false,
      hoursWorked:      props["⏳ Hours Worked"]?.number ?? 0,
      dailyViews:       props["Daily Views "]?.number ?? 0, // trailing space in DB
      summaryOfDay:     props["🏁 Summary of Day"]?.rich_text?.[0]?.plain_text ?? "",
      mindsetNotes:     props["🧠 Mindset Notes"]?.rich_text?.[0]?.plain_text ?? "",
    };

    return NextResponse.json({ entry, dateLabel: label });
  } catch (error: any) {
    console.error("Notion log GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json();
  const { label } = torontoTodayBounds();

  const properties: Record<string, any> = {
    "Entry":                       { title: [{ text: { content: label } }] },
    "Workout":                     { checkbox: !!body.workout },
    "NF":                          { checkbox: !!body.nf },
    "📹 Posted 1 Video or Reel?":  { checkbox: !!body.postedVideo },
    "✍️ Reflected in Journal?":    { checkbox: !!body.reflectedJournal },
    "⏳ Hours Worked":              { number: body.hoursWorked ?? 0 },
    "Daily Views ":                { number: body.dailyViews ?? 0 },
    "🏁 Summary of Day":            { rich_text: [{ text: { content: body.summaryOfDay ?? "" } }] },
    "🧠 Mindset Notes":             { rich_text: [{ text: { content: body.mindsetNotes ?? "" } }] },
  };

  try {
    const logDsId = await resolveDataSourceId(DB.LOG);

    // Look up today's entry by title using the CANONICAL title-property ID
    // `"title"` — Notion 2025-09-03 silently returns 0 results when the
    // display name "Entry" is used here. See file header for details.
    const existing = await notion.dataSources.query({
      data_source_id: logDsId,
      filter: { property: "title", title: { equals: label } } as never,
      page_size: 1,
    });

    let pageId: string;
    if (existing.results.length > 0) {
      // Existing entry titled `label` (i.e. today) → update in place.
      pageId = existing.results[0].id;
      await notion.pages.update({ page_id: pageId, properties: properties as never });
    } else {
      // No entry for today → create a fresh page. Date And Time Logged
      // (created_time) is set automatically by Notion on creation.
      const page = await notion.pages.create({
        parent: { data_source_id: logDsId } as never,
        properties: properties as never,
      } as never);
      pageId = page.id;
    }

    return NextResponse.json({ ok: true, pageId });
  } catch (error: any) {
    // Surface the actual Notion error so the user sees WHY the save failed
    // (wrong DB ID, schema mismatch, auth) instead of a useless "Server error".
    const msg = error?.body?.message ?? error?.message ?? "Server error";
    console.error("Notion log POST error:", msg, error?.body);
    return NextResponse.json({ error: String(msg).slice(0, 240) }, { status: 500 });
  }
}
