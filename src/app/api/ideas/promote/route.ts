import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";

// POST /api/ideas/promote { id, pillar?, type?, effortLevel? }
// → Creates a Notion SV Videos entry (Status: Idea) from the raw idea,
//   marks the idea_inbox row as promoted, stores the Notion page ID.
export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id, pillar = "Building AI Systems", type = "Long Form", effortLevel = "Medium" } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Fetch the idea
  const { data: idea, error: fetchErr } = await supabase
    .from("idea_inbox")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (fetchErr || !idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  if (idea.promoted)     return NextResponse.json({ error: "Already promoted" }, { status: 409 });

  // Create the Notion SV Videos page
  let pageId: string;
  try {
    const page = await notion.pages.create({
      parent: { data_source_id: DB.VIDEOS },
      properties: {
        "Title":          { title: [{ text: { content: idea.text } }] },
        "Status":         { select: { name: "Idea" } },
        "Type":           { select: { name: type } },
        "Content Pillar": { select: { name: pillar } },
        "Effort Level":   { select: { name: effortLevel } },
      } as never,
    } as never);
    pageId = (page as any).id;
  } catch (e: any) {
    console.error("Promote → Notion create failed:", e?.message);
    return NextResponse.json({ error: `Notion error: ${e?.message}` }, { status: 500 });
  }

  // Mark as promoted
  await supabase
    .from("idea_inbox")
    .update({ promoted: true, promoted_at: new Date().toISOString(), notion_page_id: pageId })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true, pageId });
}
