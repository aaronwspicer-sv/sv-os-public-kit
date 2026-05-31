// Read/edit the SV-GPT skill — Alfred's identity.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { fetchActiveSkill, fetchSkillHistory, appendSkillVersion } from "@/lib/alfred/identity";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const [active, history] = await Promise.all([
    fetchActiveSkill(supabase, user.id),
    fetchSkillHistory(supabase, user.id),
  ]);
  return NextResponse.json({ active, history });
}

export async function PUT(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const content = String(body?.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "Content is empty" }, { status: 400 });
  if (content.length > 50_000) return NextResponse.json({ error: "Skill too long (50k char max)" }, { status: 400 });

  try {
    const version = await appendSkillVersion(supabase, user.id, content, user.email ?? "owner");
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "sv_gpt_skill_updated", metadata: { version },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true, version });
  } catch (err: any) {
    console.error("skill save failed:", err?.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
