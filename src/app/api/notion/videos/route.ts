import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";

// ── GET — full SV Videos with all fields exposed ────────────────
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const response = await notion.dataSources.query({
      data_source_id: DB.VIDEOS,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    });

    const videos = response.results.map((page: any) => {
      const props = page.properties ?? {};
      return {
        id:                page.id,
        notionUrl:         props["Notion Page URL"]?.rich_text?.[0]?.plain_text ?? page.url ?? null,
        title:             props["Title"]?.title?.[0]?.plain_text ?? "Untitled",
        status:            props["Status"]?.select?.name ?? "Idea",
        type:              props["Type"]?.select?.name ?? "Long Form",
        pillar:            props["Content Pillar"]?.select?.name ?? "Building AI Systems",
        platform:          (props["Platform"]?.multi_select ?? []).map((p: any) => p.name),
        effortLevel:       props["Effort Level"]?.select?.name ?? "Medium",
        publishDate:       props["Publish Date"]?.date?.start ?? null,
        views:             props["Views"]?.number ?? 0,
        thumbnail:         props["Thumbnail"]?.url ?? null,
        finalVideo:        props["Final Video"]?.url ?? null,
        slug:              props["Slug"]?.rich_text?.[0]?.plain_text ?? null,
        notes:             props["Notes"]?.rich_text?.[0]?.plain_text ?? "",
        parentVideoId:     props["Parent Video"]?.relation?.[0]?.id ?? null,
        shortFormClipIds:  (props["Short Form Clips"]?.relation ?? []).map((r: any) => r.id),
        viralInspirationId:props["Viral Inspiration"]?.relation?.[0]?.id ?? null,
        lastEdited:        page.last_edited_time ?? null,
        createdTime:       page.created_time ?? null,
      };
    });

    return NextResponse.json({ videos });
  } catch (error: any) {
    console.error("Notion videos GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST — create a new video idea ──────────────────────────────
export async function POST(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { title, type = "Long Form", pillar = "Building AI Systems", effortLevel = "Medium" } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required" }, { status: 400 });

  try {
    const page = await notion.pages.create({
      parent: { data_source_id: DB.VIDEOS },
      properties: {
        "Title":          { title: [{ text: { content: title.trim() } }] },
        "Status":         { select: { name: "Idea" } },
        "Type":           { select: { name: type } },
        "Content Pillar": { select: { name: pillar } },
        "Effort Level":   { select: { name: effortLevel } },
      } as never,
    } as never);
    return NextResponse.json({ ok: true, pageId: (page as any).id });
  } catch (error: any) {
    console.error("Notion videos POST error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PATCH — update status, views, publish date, etc. ────────────
export async function PATCH(req: Request) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json();
  const { pageId } = body;
  if (!pageId) return NextResponse.json({ error: "Missing pageId" }, { status: 400 });

  const properties: Record<string, any> = {};
  if (body.status      !== undefined) properties["Status"]         = { select: { name: body.status } };
  if (body.views       !== undefined) properties["Views"]          = { number: Number(body.views) };
  if (body.publishDate !== undefined) properties["Publish Date"]   = body.publishDate ? { date: { start: body.publishDate } } : { date: null };
  if (body.title       !== undefined) properties["Title"]          = { title: [{ text: { content: body.title } }] };
  if (body.pillar      !== undefined) properties["Content Pillar"] = { select: { name: body.pillar } };
  if (body.effortLevel !== undefined) properties["Effort Level"]   = { select: { name: body.effortLevel } };
  if (body.type        !== undefined) properties["Type"]           = { select: { name: body.type } };
  if (body.notes       !== undefined) properties["Notes"]          = { rich_text: [{ text: { content: body.notes } }] };

  if (Object.keys(properties).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    await notion.pages.update({ page_id: pageId, properties: properties as never });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Notion videos PATCH error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
