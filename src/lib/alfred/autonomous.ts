// Alfred's autonomous layer:
//   - detectPatterns(snapshot)   → list of human-readable alerts worth surfacing
//   - generateAlfredReview(user) → multi-paragraph coach-style weekly review in Aaron's voice
//   - generateMorningInsight()   → 1-2 sentence Alfred read on TODAY (added to morning brief)
//
// All of this leans on the SV-GPT skill + live OS state so the output sounds
// like Alfred, not a generic "your week in numbers" digest.
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { gatherUserData } from "@/lib/brief/userData";
import { fetchActiveSkill } from "./identity";
import { saveMemory } from "./memory";
import { defaultSkill } from "./defaultSkill";
import { config } from "@/config";

const MODEL_FULL = process.env.OPENAI_ALFRED_MODEL ?? "gpt-4o";
const MODEL_LITE = "gpt-4o-mini";

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface Pattern {
  severity: "ok" | "warn" | "alert" | "celebrate";
  emoji: string;
  text: string;
}

/** Pure data-driven pattern detection. No LLM call. */
export function detectPatterns(d: Awaited<ReturnType<typeof gatherUserData>>): Pattern[] {
  const out: Pattern[] = [];
  const s = d.streaks;

  // Streak at PR
  if (s.workout >= d.longestWorkoutEver && s.workout >= 5) {
    out.push({ severity: "celebrate", emoji: "🏆", text: `Workout streak at ${s.workout} days — your all-time longest. Don't blink.` });
  }

  // Workout streak broken right after a long run
  if (s.workout === 0 && d.longestWorkoutEver >= 10) {
    out.push({ severity: "warn", emoji: "🔧", text: `Workout streak broke. Day 1 today.` });
  }

  // Major active streak
  if (s.nf >= 14)      out.push({ severity: "celebrate", emoji: "🔥", text: `${s.nf} days NF.` });
  if (s.journal >= 10) out.push({ severity: "celebrate", emoji: "✍️", text: `${s.journal} days journaling straight.` });

  // No video posted in 10+ days
  if (s.video === 0 && d.videosPipeline["Live"] !== undefined) {
    // We don't have last-published date directly — approximate via streaks
    out.push({ severity: "warn", emoji: "📹", text: `No video posted recently — YouTube thread is thin.` });
  }

  // Money pulse
  if (d.unreviewedTxCount >= 10) {
    out.push({ severity: "warn", emoji: "💰", text: `${d.unreviewedTxCount} unreviewed transactions piling up.` });
  }

  // Light week
  if (d.weekHours > 0 && d.weekHours < 15) {
    out.push({ severity: "warn", emoji: "⚠️", text: `Only ${d.weekHours}h this week. Below pace.` });
  }
  // Heavy week (could be good or bad depending on school)
  if (d.weekHours >= 40) {
    out.push({ severity: "alert", emoji: "🚨", text: `${d.weekHours}h this week — that's heavy. Is school still getting its share?` });
  }

  // Content pipeline stalled
  const pipeline = d.videosPipeline;
  const stalledScripting = (pipeline["Scripting"] ?? 0) >= 3;
  const stalledEditing   = (pipeline["Editing"]   ?? 0) >= 2;
  if (stalledScripting) out.push({ severity: "warn", emoji: "📝", text: `${pipeline["Scripting"]} videos sitting in Scripting. Bottleneck.` });
  if (stalledEditing)   out.push({ severity: "warn", emoji: "🎬", text: `${pipeline["Editing"]} videos stuck in Editing.` });

  return out;
}

/** Short Alfred read on today (1-2 sentences) for the morning brief hero callout. */
export async function generateMorningInsight(userId: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const sb = admin();
    const [data, skill] = await Promise.all([gatherUserData(userId), fetchActiveSkill(sb, userId)]);
    const patterns = detectPatterns(data);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: MODEL_LITE,
      messages: [
        {
          role: "system",
          content: `You are Alfred. One sentence of insight for ${config.owner.name} this morning, in their voice. No emoji. No filler. Specific. Choose the most relevant signal from the data + patterns. If nothing notable, give ONE focused move for today.

Voice: direct, specific, short — match the OWNER PROFILE below. No generic motivation.

OWNER PROFILE (identity):
${(skill?.content ?? defaultSkill()).slice(0, 4000)}`,
        },
        {
          role: "user",
          content: `Live state:
- Today's habits: workout=${data.todayLog?.workout ?? "?"}, nf=${data.todayLog?.nf ?? "?"}, video=${data.todayLog?.video ?? "?"}, journal=${data.todayLog?.journal ?? "?"}
- Streaks: workout ${data.streaks.workout}, nf ${data.streaks.nf}, video ${data.streaks.video}, journal ${data.streaks.journal} (longest workout ever ${data.longestWorkoutEver})
- This week: ${data.weekHours}h worked, $${data.weekSpend} spent, ${data.monthVideos} videos this month
- Open tasks today: ${data.todosOpenCount}
- Unreviewed tx: ${data.unreviewedTxCount}
- Patterns: ${patterns.map(p => `${p.emoji} ${p.text}`).join(" | ") || "none"}

Write Alfred's one-sentence morning take.`,
        },
      ],
    });
    return r.choices[0]?.message?.content?.trim() ?? null;
  } catch (err: any) {
    console.error("generateMorningInsight failed:", err?.message);
    return null;
  }
}

/** Full Sunday Coach Review — multi-paragraph, gpt-4o, Alfred's voice. */
export async function generateAlfredReview(userId: string): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const sb = admin();
    const [data, skill] = await Promise.all([gatherUserData(userId), fetchActiveSkill(sb, userId)]);
    const patterns = detectPatterns(data);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.chat.completions.create({
      model: MODEL_FULL,
      messages: [
        {
          role: "system",
          content: `You are Alfred, writing ${config.owner.name}'s Sunday weekly review email. This is THE proactive coach moment — direct, specific, no validation theatre.

Structure (4 short sections, each 2-4 sentences):
1) HEADLINE — one-line verdict on the week, in ${config.owner.name}'s voice
2) WHAT WORKED — the specific wins with numbers
3) WHAT SLIPPED — the honest read on what didn't land, why, no hedging
4) THE ONE MOVE for next week — concrete and realistic for their constraints

Voice rules:
- Specifics + numbers everywhere; short sentences
- Direct without arrogance
- Match the voice + priorities defined in the OWNER PROFILE below — don't impose a generic creator/coach tone

OWNER PROFILE (their second brain — apply it):
${(skill?.content ?? defaultSkill()).slice(0, 5000)}`,
        },
        {
          role: "user",
          content: `Live state going into this Sunday review:

Today: ${data.todayDate}
THIS WEEK
- Hours worked: ${data.weekHours}h
- Money spent: $${data.weekSpend}
- Money earned: $${data.weekIncome}
- Videos shipped this month: ${data.monthVideos}

ACTIVE STREAKS
- Workout: ${data.streaks.workout}d (PR ${data.longestWorkoutEver}d)
- NF: ${data.streaks.nf}d
- Video: ${data.streaks.video}d
- Journal: ${data.streaks.journal}d

YESTERDAY
${data.yesterdayLog ? JSON.stringify(data.yesterdayLog) : "no log"}

OPEN TASKS TODAY: ${data.todosOpenCount}
UNREVIEWED TX: ${data.unreviewedTxCount}
CONTENT PIPELINE: ${JSON.stringify(data.videosPipeline)}

DETECTED PATTERNS:
${patterns.map(p => `- ${p.emoji} [${p.severity}] ${p.text}`).join("\n") || "(none)"}

Write the Sunday review now. Keep it tight — no fluff, no validation.`,
        },
      ],
    });
    const text = r.choices[0]?.message?.content?.trim() ?? null;

    // Save the review as a long-term memory so Alfred references it next chat
    if (text) {
      const summary = text.slice(0, 1800);
      await saveMemory(sb, userId, {
        content: `Sunday review (${data.todayDate}): ${summary}`,
        kind: "conversation_summary",
        importance: 7,
        tag: "weekly-review",
      });
    }
    return text;
  } catch (err: any) {
    console.error("generateAlfredReview failed:", err?.message);
    return null;
  }
}
