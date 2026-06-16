// Returns Alfred's brain graph data — memories, people, and active pipeline
// videos — used by the BrainGraph visualization on the /d console.
import { NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";

export const runtime = "nodejs";

const STAGE_NAMES = ["Ideation","Packaging","Thumbnail","Script","Filmed","Edit Brief","Repurpose"];

export async function GET() {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const [memoriesRes, peopleRes, videosRes] = await Promise.all([
    supabase
      .from("alfred_memories")
      .select("id, content, importance, tag, kind, recall_count")
      .eq("user_id", user.id)
      .gte("importance", 5)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("alfred_people")
      .select("id, name, relationship, trust_level")
      .eq("user_id", user.id)
      .eq("trust_level", "trusted")
      .limit(6),
    supabase
      .from("pipeline_videos")
      .select("id, slug, working_title, final_title, current_stage, content_pillar, status")
      .eq("user_id", user.id)
      .neq("status", "Live")
      .order("updated_at", { ascending: false })
      .limit(4),
  ]);

  const nodes: any[] = [];

  for (const m of (memoriesRes.data ?? [])) {
    nodes.push({
      id: m.id,
      type: "memory",
      label: m.content.slice(0, 22).trim(),
      sublabel: m.tag ?? m.kind ?? "memory",
      importance: m.importance ?? 5,
      tag: m.tag,
      content: m.content.slice(0, 120),
    });
  }

  for (const p of (peopleRes.data ?? [])) {
    nodes.push({
      id: p.id,
      type: "person",
      label: p.name,
      sublabel: p.relationship,
      importance: 7,
      tag: "person",
      name: p.name,
    });
  }

  for (const v of (videosRes.data ?? [])) {
    const title = v.final_title ?? v.working_title;
    nodes.push({
      id: v.id,
      type: "video",
      label: title.slice(0, 22).trim(),
      sublabel: STAGE_NAMES[(v.current_stage ?? 1) - 1],
      importance: 6,
      tag: v.content_pillar,
      slug: v.slug,
    });
  }

  return NextResponse.json({ nodes, empty: nodes.length === 0 });
}
