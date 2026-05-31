// Public profile data layer.
// - PublicStats: the computed "character sheet" stats fed to achievements + UI
// - computePublicStats(userId): aggregates Notion + Supabase (whitelisted fields only)
// - fetchPublicProfile(slug):  loads a profile row by slug for the public page
//
// SECURITY: this lib is the ONLY surface that exposes data to non-authed
// visitors. Every field returned here must be reviewed as "public OK". We
// never return raw rows, no PII beyond what the user wrote into their
// public profile, no money, no exact dates of sensitive logs.
import { notion, DB } from "@/lib/notion";
import { createClient } from "@supabase/supabase-js";
import { config } from "@/config";

export interface PublicStats {
  // Habit / consistency
  daysLogged: number;
  maxHabitsInOneDay: number;
  // Workout
  longestWorkoutStreak: number;
  totalWorkouts: number;
  // Content
  videosPublished: number;
  topVideoViews: number;
  longFormCount: number;
  shortFormCount: number;
  pillarsCovered: number;
  // Work / output
  peakHoursDay: number;
  totalHours: number;
  goalsAchieved: number;
  // Active streaks (for display, not used in achievements yet)
  currentStreaks: {
    workout: number;
    video: number;
    journal: number;
    nf: number;
  };
}

export interface PublicProfile {
  userId: string;
  slug: string;
  displayName: string | null;
  title: string | null;
  tagline: string | null;
  location: string | null;
  avatarUrl: string | null;
  bio: string | null;
  skills: { name: string; level: number }[];
  show: {
    streaks: boolean;
    achievements: boolean;
    quests: boolean;
    battleLog: boolean;
    skills: boolean;
  };
}

/** Build a service-role Supabase client. Used for public reads that need
 *  to bypass RLS (we still only select fields that are public-safe). */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function fetchPublicProfile(slug: string): Promise<PublicProfile | null> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("public_profiles")
    .select("user_id, slug, display_name, title, tagline, location, avatar_url, bio, skills, show_streaks, show_achievements, show_quests, show_battle_log, show_skills")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return {
    userId:      data.user_id,
    slug:        data.slug,
    displayName: data.display_name,
    title:       data.title,
    tagline:     data.tagline,
    location:    data.location,
    avatarUrl:   data.avatar_url,
    bio:         data.bio,
    skills:      Array.isArray(data.skills) ? data.skills : [],
    show: {
      streaks:      !!data.show_streaks,
      achievements: !!data.show_achievements,
      quests:       !!data.show_quests,
      battleLog:    !!data.show_battle_log,
      skills:       !!data.show_skills,
    },
  };
}

/** Resolve a Notion created_time → Toronto YYYY-MM-DD */
function toTorontoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}

/** Heavy lift — pulls public-safe aggregates from Notion. Cache externally. */
export async function computePublicStats(_userId: string): Promise<PublicStats> {
  // NOTE: Notion DB IDs are global to the owner, not per-user. The OS only
  // serves one owner, so we read from the configured DBs. If we ever
  // multi-tenant this we'd key DBs off the user row.

  const [logRes, videosRes, goalsRes] = await Promise.all([
    notion.dataSources.query({
      data_source_id: DB.LOG,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 400,
    }).catch(() => ({ results: [] as any[] })),
    notion.dataSources.query({
      data_source_id: DB.VIDEOS,
      page_size: 300,
    }).catch(() => ({ results: [] as any[] })),
    notion.dataSources.query({
      data_source_id: DB.GOALS,
      page_size: 200,
    }).catch(() => ({ results: [] as any[] })),
  ]);

  // ── Log aggregation ────────────────────────────────────────
  const logRows = (logRes.results as any[]).map(p => ({
    date: toTorontoDate(p.created_time),
    workout: !!p.properties?.["Workout"]?.checkbox,
    nf:      !!p.properties?.["NF"]?.checkbox,
    video:   !!p.properties?.["📹 Posted 1 Video or Reel?"]?.checkbox,
    journal: !!p.properties?.["✍️ Reflected in Journal?"]?.checkbox,
    hours:   p.properties?.["⏳ Hours Worked"]?.number ?? 0,
  }));

  // Collapse same-date dup rows (OR for habits, sum for hours)
  const byDate = new Map<string, typeof logRows[number]>();
  for (const r of logRows) {
    const e = byDate.get(r.date);
    if (!e) byDate.set(r.date, r);
    else byDate.set(r.date, {
      date: r.date,
      workout: e.workout || r.workout,
      nf:      e.nf      || r.nf,
      video:   e.video   || r.video,
      journal: e.journal || r.journal,
      hours:   e.hours + r.hours,
    });
  }

  const allDays = [...byDate.values()];
  const daysLogged = allDays.length;
  const totalHours = allDays.reduce((s, d) => s + d.hours, 0);
  const peakHoursDay = allDays.reduce((m, d) => Math.max(m, d.hours), 0);
  const maxHabitsInOneDay = allDays.reduce(
    (m, d) => Math.max(m, [d.workout, d.nf, d.video, d.journal].filter(Boolean).length),
    0,
  );
  const totalWorkouts = allDays.filter(d => d.workout).length;

  // Longest workout streak (consecutive calendar days)
  const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let longestWorkoutStreak = 0;
  let current = 0;
  let prevDate: string | null = null;
  for (const [date, row] of sorted) {
    if (!row.workout) { current = 0; prevDate = date; continue; }
    if (prevDate) {
      const diff = Math.round(
        (new Date(date).getTime() - new Date(prevDate).getTime()) / 86400000,
      );
      current = diff === 1 ? current + 1 : 1;
    } else current = 1;
    if (current > longestWorkoutStreak) longestWorkoutStreak = current;
    prevDate = date;
  }

  // Active streaks (current, ending today or yesterday)
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  function activeStreak(key: "workout" | "video" | "journal" | "nf"): number {
    const done = new Set(allDays.filter(d => d[key]).map(d => d.date));
    let s = 0;
    const cursor = new Date(`${todayStr}T12:00:00Z`);
    for (let i = 0; i < 365; i++) {
      const ymd = cursor.toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
      if (done.has(ymd)) s++;
      else if (i > 0) break;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return s;
  }
  const currentStreaks = {
    workout: activeStreak("workout"),
    video:   activeStreak("video"),
    journal: activeStreak("journal"),
    nf:      activeStreak("nf"),
  };

  // ── Videos ─────────────────────────────────────────────────
  const videoRows = (videosRes.results as any[]).map(p => {
    const props = p.properties ?? {};
    return {
      status: props["Status"]?.select?.name ?? "",
      type:   props["Type"]?.select?.name   ?? "",
      pillar: props["Content Pillar"]?.select?.name ?? "",
      views:  props["Views"]?.number ?? 0,
    };
  });
  const published     = videoRows.filter(v => v.status === "Live");
  const videosPublished = published.length;
  const topVideoViews = published.reduce((m, v) => Math.max(m, v.views), 0);
  const longFormCount  = published.filter(v => v.type === "Long Form").length;
  const shortFormCount = published.filter(v => v.type && v.type !== "Long Form").length;
  const pillarsCovered = new Set(published.map(v => v.pillar).filter(Boolean)).size;

  // ── Goals ──────────────────────────────────────────────────
  const goalsAchieved = (goalsRes.results as any[]).filter(p => {
    const status = p.properties?.["Status"]?.status?.name ?? p.properties?.["Status"]?.select?.name ?? "";
    return /done|complete|achieved/i.test(status);
  }).length;

  return {
    daysLogged,
    maxHabitsInOneDay,
    longestWorkoutStreak,
    totalWorkouts,
    videosPublished,
    topVideoViews,
    longFormCount,
    shortFormCount,
    pillarsCovered,
    peakHoursDay: Math.round(peakHoursDay * 10) / 10,
    totalHours:   Math.round(totalHours * 10) / 10,
    goalsAchieved,
    currentStreaks,
  };
}
