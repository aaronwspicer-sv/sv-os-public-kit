// System-defined achievements. Auto-unlock when a user's computed stats
// satisfy the predicate. Order in this list = order shown on the profile.
import type { PublicStats } from "@/lib/publicProfile";

export interface Achievement {
  id: string;
  icon: string;
  name: string;
  description: string;
  /** Returns true when the user has earned this */
  check: (s: PublicStats) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  // ── Habit / consistency ─────────────────────────────────────
  { id: "first_log",      icon: "🌱", name: "First Day",           description: "Logged your first day",                check: s => s.daysLogged >= 1 },
  { id: "week_one",       icon: "⭐", name: "Week One",            description: "7 days logged",                        check: s => s.daysLogged >= 7 },
  { id: "habit_hunter",   icon: "🎯", name: "Habit Hunter",        description: "All 4 habits in a single day",         check: s => s.maxHabitsInOneDay >= 4 },
  { id: "thirty_days",    icon: "🗓️", name: "Monthly Discipline",   description: "30 days logged",                       check: s => s.daysLogged >= 30 },
  { id: "hundred",        icon: "💯", name: "Hundred",             description: "100 days logged",                      check: s => s.daysLogged >= 100 },
  { id: "year_of_days",   icon: "🌅", name: "Year of Days",        description: "365 days logged",                      check: s => s.daysLogged >= 365 },

  // ── Workout ─────────────────────────────────────────────────
  { id: "iron_week",      icon: "💪", name: "Iron Week",           description: "7-day workout streak",                 check: s => s.longestWorkoutStreak >= 7 },
  { id: "mountain",       icon: "🏔️", name: "Mountain Climber",     description: "30-day workout streak",                check: s => s.longestWorkoutStreak >= 30 },
  { id: "iron_100",       icon: "🏋️", name: "Iron 100",             description: "100 workouts logged",                  check: s => s.totalWorkouts >= 100 },

  // ── Content ─────────────────────────────────────────────────
  { id: "first_light",    icon: "🎬", name: "First Light",         description: "Shipped your first video",             check: s => s.videosPublished >= 1 },
  { id: "ten_videos",     icon: "🔟", name: "Ten and Counting",    description: "10 videos published",                  check: s => s.videosPublished >= 10 },
  { id: "going_viral",    icon: "🚀", name: "Going Viral",         description: "100K+ views on a single video",        check: s => s.topVideoViews >= 100_000 },
  { id: "long_form",      icon: "📺", name: "Long Form Legend",    description: "5 Long Form videos published",         check: s => s.longFormCount >= 5 },
  { id: "short_form",     icon: "📱", name: "Short Form Sniper",   description: "20 short-form videos published",       check: s => s.shortFormCount >= 20 },
  { id: "multi_pillar",   icon: "🌐", name: "Multi-Pillar",        description: "Published in all 4 content pillars",   check: s => s.pillarsCovered >= 4 },

  // ── Work / output ───────────────────────────────────────────
  { id: "marathon",       icon: "⚡", name: "Marathon Day",        description: "12+ hours worked in a single day",     check: s => s.peakHoursDay >= 12 },
  { id: "thousand",       icon: "⏰", name: "Thousand Hours",      description: "1000 lifetime hours worked",           check: s => s.totalHours >= 1000 },
  { id: "goal_crusher",   icon: "🥅", name: "Goal Crusher",        description: "Completed a life goal",                check: s => s.goalsAchieved >= 1 },
];
