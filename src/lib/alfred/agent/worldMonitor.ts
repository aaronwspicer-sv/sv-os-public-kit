// Weekly world-monitor — Tavily searches for brand/name mentions + creator
// trends, distilled by GPT into Alfred memories + a push digest. Extracted to a
// lib function so it "rides along" inside the evening-recap cron (weekly) rather
// than burning one of Vercel Hobby's 2 cron slots on its own schedule.
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveMemory } from "../memory";
import { sendPushToUser } from "@/lib/push";
import { config } from "@/config";

const MODEL = process.env.OPENAI_ALFRED_MODEL ?? "gpt-4o";

interface SearchHit { title: string; url: string; content: string }

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "web"; }
}

async function tavily(query: string, maxResults = 5): Promise<{ answer: string | null; results: SearchHit[] }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { answer: null, results: [] };
  try {
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key, query, search_depth: "basic", max_results: maxResults,
        include_answer: true, include_raw_content: false, topic: "news", days: 8,
      }),
      cache: "no-store",
    });
    if (!r.ok) return { answer: null, results: [] };
    const d = await r.json();
    return {
      answer: d.answer ?? null,
      results: (d.results ?? []).map((x: any) => ({
        title: String(x.title ?? ""), url: String(x.url ?? ""), content: String(x.content ?? "").slice(0, 500),
      })),
    };
  } catch (err: any) {
    console.error("tavily failed:", err?.message);
    return { answer: null, results: [] };
  }
}

export interface WorldMonitorResult { saved: number; errors: string[]; ran: boolean }

/** Run the weekly world scan for the given owners. No-op (ran=false) if the
 *  required keys aren't set. Best-effort; never throws. */
export async function runWorldMonitor(sb: SupabaseClient, ownerIds: string[]): Promise<WorldMonitorResult> {
  if (!process.env.TAVILY_API_KEY || !process.env.OPENAI_API_KEY) {
    return { saved: 0, errors: [], ran: false };
  }

  const brand = config.brand.name;
  const fullName = config.owner.fullName;
  const queries = [
    `"${fullName}" OR "${brand}" creator content`,
    `young content creator YouTube growth trends this week`,
    `creator economy news short-form video monetization`,
  ];

  const saved: string[] = [];
  const errors: string[] = [];

  try {
    const searches = await Promise.all(queries.map(q => tavily(q)));
    const [mentions, niche, economy] = searches;
    const totalHits = searches.reduce((n, s) => n + s.results.length, 0);
    if (totalHits === 0) return { saved: 0, errors: [], ran: true };

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: MODEL,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are Alfred's world-monitoring layer for ${fullName} (brand: ${brand}) — a young creator/entrepreneur building in public.

You're given this week's web search results across three angles: (1) direct mentions of them/their brand, (2) their niche's creator-growth trends, (3) the broader creator economy.

Extract ONLY genuinely useful, specific signals worth remembering — things that would change a decision or are worth a heads-up. Skip generic listicles and evergreen advice. Quality over quantity — 0 to 4 memories total.

Return JSON: { "memories": [ { "content": string, "importance": 1-10 } ], "digest": string }
- "content": one tight sentence Alfred would recall later. Lead with the fact. Include the source domain in parens if it's a real claim.
- "importance": 8-10 only for direct brand/name mentions; 4-6 for relevant trends; below 4 don't include it.
- "digest": one push-notification-length line (<140 chars), or "Quiet week — nothing notable on the radar." if nothing landed.`,
        },
        {
          role: "user",
          content: `BRAND/NAME MENTIONS (${mentions.results.length}):
${mentions.answer ? `answer: ${mentions.answer}\n` : ""}${mentions.results.map(h => `- ${h.title} (${hostOf(h.url)}): ${h.content}`).join("\n") || "(none)"}

NICHE CREATOR TRENDS (${niche.results.length}):
${niche.answer ? `answer: ${niche.answer}\n` : ""}${niche.results.map(h => `- ${h.title} (${hostOf(h.url)}): ${h.content}`).join("\n") || "(none)"}

CREATOR ECONOMY (${economy.results.length}):
${economy.answer ? `answer: ${economy.answer}\n` : ""}${economy.results.map(h => `- ${h.title} (${hostOf(h.url)}): ${h.content}`).join("\n") || "(none)"}

Extract the memories + digest now.`,
        },
      ],
    });

    let parsed: { memories?: { content: string; importance?: number }[]; digest?: string } = {};
    try { parsed = JSON.parse(r.choices[0]?.message?.content ?? "{}"); } catch { parsed = {}; }
    const memories = (parsed.memories ?? []).filter(m => m?.content?.trim());
    const digest = parsed.digest?.trim() || "Quiet week — nothing notable on the radar.";

    for (const uid of ownerIds) {
      for (const m of memories) {
        try {
          const res = await saveMemory(sb, uid, {
            content: m.content.trim(),
            kind: "pattern",
            importance: Math.max(1, Math.min(10, Math.round(m.importance ?? 5))),
            tag: "world-monitor",
          });
          if (res) saved.push(res.id);
        } catch (err: any) {
          errors.push(`save: ${err?.message ?? "unknown"}`);
        }
      }
      await sendPushToUser(uid, {
        title: "🛰️ Alfred — weekly world scan",
        body: digest,
        url: "/d",
        tag: "world-monitor",
      }, sb).catch(() => {});
    }

    return { saved: saved.length, errors, ran: true };
  } catch (err: any) {
    console.error("runWorldMonitor failed:", err?.message);
    return { saved: saved.length, errors: [...errors, err?.message ?? "failed"], ran: true };
  }
}
