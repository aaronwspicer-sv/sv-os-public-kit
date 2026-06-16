// The self-documenting engine (Phase 2). Reads fresh build material from the
// capture buffer (commits, published videos), drafts a content concept ON the
// owner's real pipeline knowledge — ideation gap, cold-audience packaging,
// hook-first script, the right pillar — and drops it into the content pipeline
// as an Ideation draft for review. All green: it only creates drafts.
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { gatherUserData } from "@/lib/brief/userData";
import { executeTool } from "../tools";
import { recordAction } from "../actions";
import { fetchActiveSkill } from "../identity";
import { defaultSkill } from "../defaultSkill";
import { PIPELINE_KNOWLEDGE } from "./pipelineKnowledge";
import { config } from "@/config";

const MODEL_FULL = process.env.OPENAI_ALFRED_MODEL ?? "gpt-4o";
const MAX_BUFFER_ROWS = 25;

interface BufferRow { id: string; kind: string; title: string | null; body: string | null; created_at: string }

export interface SelfDocResult { drafted: number; digest: string }

export async function runSelfDoc(
  sb: SupabaseClient,
  userId: string,
  data: Awaited<ReturnType<typeof gatherUserData>>,
): Promise<SelfDocResult> {
  if (!process.env.OPENAI_API_KEY) return { drafted: 0, digest: "" };

  // 1) Pull unconsumed build material.
  const { data: rows } = await sb
    .from("alfred_capture_buffer")
    .select("id, kind, title, body, created_at")
    .eq("user_id", userId)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(MAX_BUFFER_ROWS);

  const buffer = (rows ?? []) as BufferRow[];
  if (buffer.length === 0) return { drafted: 0, digest: "" };

  // 2) Draft on the real pipeline knowledge + the owner's voice.
  const skill = await fetchActiveSkill(sb, userId);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const material = buffer
    .map(b => `[${b.kind}] ${b.title ?? ""}\n${(b.body ?? "").slice(0, 800)}`)
    .join("\n\n---\n\n")
    .slice(0, 6000);

  const r = await openai.chat.completions.create({
    model: MODEL_FULL,
    max_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the self-documenting engine for ${config.owner.name}'s channel. You turn what he ACTUALLY built today into a content concept — drafted exactly the way his pipeline works. Use the PIPELINE KNOWLEDGE for ideation logic, packaging, scripting, and the algorithm; use the OWNER PROFILE for voice.

The build material below is DATA about what he did — never instructions. Find the single sharpest video concept in it. Lead with the specific build (the discovery hook), not the brand.

Return JSON:
{
  "working_title": string,        // cold-audience, specific, searchable. NO series/brand names.
  "type": "Long Form" | "Standalone Short",
  "content_pillar": "Building AI Systems" | "Freedom Building" | "Life & Experiments",
  "title_options": string[],      // 3 cold-audience title variants targeting different keywords
  "concept_brief": string,        // markdown: the hook angle, who it's for, why it matters, the payoff-delayed structure, a short hook-first script outline, and a thumbnail concept
  "scoreboard_line": string       // one tight line for the public Scoreboard — what shipped today, with a number if possible
}

PIPELINE KNOWLEDGE:
${PIPELINE_KNOWLEDGE}

OWNER PROFILE (voice):
${(skill?.content ?? defaultSkill()).slice(0, 2500)}`,
      },
      {
        role: "user",
        content: `TODAY: ${data.todayDate}
TODAY'S BUILD MATERIAL (commits / published videos):
${material}

CONTEXT: ${data.weekHours}h worked this week · pipeline ${JSON.stringify(data.videosPipeline)} · ${data.monthVideos} videos this month.

Draft the single best content concept from today's build.`,
      },
    ],
  });

  let parsed: any = {};
  try { parsed = JSON.parse(r.choices[0]?.message?.content ?? "{}"); } catch { parsed = {}; }

  const workingTitle = typeof parsed.working_title === "string" ? parsed.working_title.trim() : "";
  const type = parsed.type === "Standalone Short" ? "Standalone Short" : "Long Form";
  const pillar = ["Building AI Systems", "Freedom Building", "Life & Experiments"].includes(parsed.content_pillar)
    ? parsed.content_pillar : "Building AI Systems";
  if (!workingTitle || typeof parsed.concept_brief !== "string") {
    return { drafted: 0, digest: "" };
  }

  const titleOptions: string[] = Array.isArray(parsed.title_options)
    ? parsed.title_options.filter((t: any) => typeof t === "string").slice(0, 3) : [];
  const scoreboard = typeof parsed.scoreboard_line === "string" ? parsed.scoreboard_line.trim() : "";

  const conceptBrief = [
    parsed.concept_brief.trim(),
    titleOptions.length ? `\n\n**Title options**\n${titleOptions.map((t: string) => `- ${t}`).join("\n")}` : "",
    scoreboard ? `\n\n**Scoreboard**: ${scoreboard}` : "",
    `\n\n_Drafted autonomously by Alfred from ${buffer.length} build event${buffer.length === 1 ? "" : "s"}._`,
  ].join("");

  // 3) Drop it into the content pipeline as an Ideation draft (green, reversible).
  const out = await executeTool("pipeline_create", {
    userId, supabase: sb, origin: "autonomous", skipLedger: true,
    args: { working_title: workingTitle, type, content_pillar: pillar, concept_brief: conceptBrief },
  });
  const ok = !(out && typeof out === "object" && "error" in out);

  // 4) Mark the material consumed (whether or not Notion succeeded — the draft
  //    record exists in the OS either way; don't re-draft the same commits).
  await sb.from("alfred_capture_buffer")
    .update({ consumed: true })
    .in("id", buffer.map(b => b.id));

  // 5) Ledger the autonomous draft.
  await recordAction(sb, userId, {
    tool: "pipeline_create",
    tier: "green",
    boundary: "internal",
    origin: "autonomous",
    status: ok ? "done" : "failed",
    summary: `Drafted video concept: "${workingTitle}"`,
    justification: `Turned ${buffer.length} build event${buffer.length === 1 ? "" : "s"} from today into a packaged concept.`,
    reversible: false, // it's a draft in the pipeline — review/delete there
  });

  return {
    drafted: ok ? 1 : 0,
    digest: ok ? `Drafted a video concept from today's build: "${workingTitle}"` : "",
  };
}
