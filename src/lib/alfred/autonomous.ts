// Alfred's autonomous layer:
//   - detectPatterns(snapshot)   → list of human-readable alerts worth surfacing
//   - generateAlfredReview(user) → multi-paragraph coach-style weekly review in Aaron's voice
//   - generateMorningInsight()   → 1-2 sentence Alfred read on TODAY (added to morning brief)
//   - generateFullBrief()        → 3-paragraph Alfred narrative for the morning email
//
// All of this leans on the SV-GPT skill + live OS state so the output sounds
// like Alfred, not a generic "your week in numbers" digest.
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { gatherUserData } from "@/lib/brief/userData";
import type { Weather, NewsItem, Ticker } from "@/lib/brief/sources";
import { getEventsForDate } from "@/lib/calendar";
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

export interface DeadTimeSlot {
  startHour: number; // local Toronto hour (0-23)
  endHour: number;
  durationMin: number;
  label: string; // e.g. "2h gap — 10am to 12pm"
}

/**
 * Find unscheduled blocks ≥ MIN_GAP_MIN during work hours (WORK_START..WORK_END)
 * today in the Toronto timezone. Returns up to 3 slots, sorted by size desc.
 */
export async function detectDeadTime(
  sb: SupabaseClient,
  userId: string,
): Promise<DeadTimeSlot[]> {
  const WORK_START = 9;   // 9am
  const WORK_END   = 19;  // 7pm
  const MIN_GAP_MIN = 60; // at least 1h to count

  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  const events = await getEventsForDate(sb, userId, todayStr);

  // Convert to [startMin, endMin] relative to midnight Toronto, non-all-day only
  type Block = [number, number];
  const blocks: Block[] = events
    .filter(e => !e.allDay)
    .map(e => {
      const toMin = (iso: string) => {
        const d = new Date(iso);
        // minutes since midnight in Toronto
        const localStr = d.toLocaleTimeString("en-CA", { timeZone: config.locale.timezone, hour12: false });
        const [hh, mm] = localStr.split(":").map(Number);
        return hh * 60 + mm;
      };
      return [toMin(e.start), toMin(e.end)] as Block;
    })
    .filter(([s, e]) => e > s) // skip zero-length
    .sort((a, b) => a[0] - b[0]);

  // Merge overlapping blocks
  const merged: Block[] = [];
  for (const b of blocks) {
    if (merged.length === 0 || b[0] >= merged[merged.length - 1][1]) {
      merged.push([...b]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], b[1]);
    }
  }

  // Clamp to work hours and find gaps
  const slots: DeadTimeSlot[] = [];
  let cursor = WORK_START * 60;
  const workEnd = WORK_END * 60;

  for (const [bs, be] of merged) {
    const blockStart = Math.max(bs, WORK_START * 60);
    const blockEnd   = Math.min(be, workEnd);
    if (blockStart > cursor && blockStart - cursor >= MIN_GAP_MIN) {
      const durMin = blockStart - cursor;
      slots.push({
        startHour: cursor / 60,
        endHour:   blockStart / 60,
        durationMin: durMin,
        label: `${Math.round(durMin / 60 * 10) / 10}h gap — ${fmtHour(cursor / 60)} to ${fmtHour(blockStart / 60)}`,
      });
    }
    cursor = Math.max(cursor, blockEnd);
  }
  // Trailing gap
  if (workEnd - cursor >= MIN_GAP_MIN) {
    const durMin = workEnd - cursor;
    slots.push({
      startHour: cursor / 60,
      endHour:   WORK_END,
      durationMin: durMin,
      label: `${Math.round(durMin / 60 * 10) / 10}h gap — ${fmtHour(cursor / 60)} to ${fmtHour(WORK_END)}`,
    });
  }

  return slots.sort((a, b) => b.durationMin - a.durationMin).slice(0, 3);
}

function fmtHour(h: number): string {
  const whole = Math.floor(h);
  const min   = Math.round((h - whole) * 60);
  const label = whole >= 12 ? "pm" : "am";
  const display = whole > 12 ? whole - 12 : whole === 0 ? 12 : whole;
  return min === 0 ? `${display}${label}` : `${display}:${String(min).padStart(2, "0")}${label}`;
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

/** 3-paragraph Alfred narrative for the morning brief email.
 *  Covers: state of play (numbers + trajectory), world context (news/markets),
 *  and the one move for today. Caller passes pre-fetched data + sources so we
 *  don't double-fetch from the cron. */
export async function generateFullBrief(
  userId: string,
  data: Awaited<ReturnType<typeof gatherUserData>>,
  patterns: Pattern[],
  sources: { weather: Weather | null; headlines: NewsItem[]; markets: Ticker[] },
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const sb = admin();
    const skill = await fetchActiveSkill(sb, userId);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const marketStr = sources.markets.map(m =>
      `${m.symbol} $${m.price >= 100 ? Math.round(m.price).toLocaleString() : m.price.toFixed(2)} (${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(1)}%)`
    ).join(", ");

    const r = await openai.chat.completions.create({
      model: MODEL_FULL,
      max_tokens: 320,
      messages: [
        {
          role: "system",
          content: `You are Alfred — ${config.owner.name}'s personal AI. Write the "Alfred's Read" section of their morning brief email.

3 short paragraphs, ~150-180 words total:
1) State of play: what's actually happening with their numbers + trajectory right now. Call out the gap between input and output if there is one.
2) World context: one headline or market signal that's directly relevant to their situation as a young creator/entrepreneur. Skip this paragraph if nothing applies — don't force it.
3) The move: one specific, concrete action to do TODAY based on where they are.

Voice: direct, no filler, no "great work". Numbers where they exist. Short sentences. Match the owner profile below.

OWNER PROFILE:
${(skill?.content ?? defaultSkill()).slice(0, 3000)}`,
        },
        {
          role: "user",
          content: `TODAY: ${data.todayDate}

STREAKS: workout ${data.streaks.workout}d · NF ${data.streaks.nf}d · video ${data.streaks.video}d · journal ${data.streaks.journal}d (workout PR: ${data.longestWorkoutEver}d)
YESTERDAY: ${data.yesterdayLog ? `${[data.yesterdayLog.workout, data.yesterdayLog.nf, data.yesterdayLog.video, data.yesterdayLog.journal].filter(Boolean).length}/4 habits · ${data.yesterdayLog.hours.toFixed(1)}h worked` : "no log"}
WEEK: ${data.weekHours}h worked · ${data.monthVideos} videos this month
OPEN TASKS: ${data.todosOpen.slice(0, 6).map(t => t.text).join(" | ") || "none"}
PIPELINE: ${JSON.stringify(data.videosPipeline)}
UNREVIEWED TX: ${data.unreviewedTxCount}
PATTERNS: ${patterns.map(p => `[${p.severity}] ${p.text}`).join(" | ") || "none"}

WORLD:
Weather: ${sources.weather ? `${sources.weather.tempC}°C · high ${sources.weather.highC}°` : "n/a"}
Markets: ${marketStr || "unavailable"}
Headlines: ${sources.headlines.slice(0, 5).map(h => h.title).join(" | ") || "none"}

Write Alfred's Read now. Three paragraphs, no greetings, no sign-off.`,
        },
      ],
    });
    return r.choices[0]?.message?.content?.trim() ?? null;
  } catch (err: any) {
    console.error("generateFullBrief failed:", err?.message);
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
