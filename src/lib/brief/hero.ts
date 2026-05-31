// Picks ONE hero callout for the day. Cascading priority:
//   1. New all-time-record streak
//   2. Active streak ≥ 7 days (celebrate)
//   3. Streak broken yesterday (warning rebuild prompt)
//   4. Yesterday A+ (4/4 habits + 6+ hours)
//   5. Yesterday F (0/4 habits)
//   6. Memory: one-year-ago entry exists
//   7. Default rest-day framing
import type { UserBriefData } from "./userData";

export interface Hero {
  emoji: string;
  text: string;
  tone: "celebrate" | "warn" | "neutral" | "memory";
}

export function pickHero(data: UserBriefData): Hero {
  const { streaks, longestWorkoutEver, yesterdayLog, oneYearAgoLog } = data;
  const maxStreak = Math.max(streaks.workout, streaks.nf, streaks.video, streaks.journal);

  // 1. New record workout streak
  if (streaks.workout >= longestWorkoutEver && streaks.workout >= 5) {
    return { emoji: "🏆", text: `Day ${streaks.workout} of workouts — your longest ever.`, tone: "celebrate" };
  }

  // 2. Major active streak
  if (maxStreak >= 30) {
    const label = pickStreakLabel(streaks);
    return { emoji: "🔥", text: `${maxStreak} days deep on ${label}. Don't break the chain.`, tone: "celebrate" };
  }
  if (maxStreak >= 7) {
    const label = pickStreakLabel(streaks);
    return { emoji: "🔥", text: `Day ${maxStreak} of ${label}.`, tone: "celebrate" };
  }

  // 3. Broken streak yesterday (any habit went 0 after at least a 5-day run earlier)
  // Simple heuristic: yesterday had no habits AND we have a meaningful longest-ever
  if (yesterdayLog && longestWorkoutEver >= 5 && !yesterdayLog.workout && streaks.workout === 0) {
    return { emoji: "🔧", text: "Streak broke yesterday. Today's the rebuild.", tone: "warn" };
  }

  // 4. Yesterday A+
  if (yesterdayLog) {
    const count = [yesterdayLog.workout, yesterdayLog.nf, yesterdayLog.video, yesterdayLog.journal].filter(Boolean).length;
    if (count === 4 && yesterdayLog.hours >= 6) {
      return { emoji: "🏁", text: `4/4 habits + ${yesterdayLog.hours.toFixed(1)}h worked yesterday. A+ day.`, tone: "celebrate" };
    }
    if (count === 0 && yesterdayLog.hours === 0) {
      return { emoji: "♻️", text: "Yesterday was a wash. Reset starts now.", tone: "warn" };
    }
  }

  // 5. Memory
  if (oneYearAgoLog) {
    const count = [oneYearAgoLog.workout, oneYearAgoLog.nf, oneYearAgoLog.video, oneYearAgoLog.journal].filter(Boolean).length;
    return {
      emoji: "📅",
      text: `One year ago today: ${count}/4 habits, ${oneYearAgoLog.hours.toFixed(1)}h worked. Look how far you've come.`,
      tone: "memory",
    };
  }

  // 6. Default
  return { emoji: "🌱", text: "A clean page. What's the one thing today?", tone: "neutral" };
}

function pickStreakLabel(s: UserBriefData["streaks"]): string {
  const ranked: [string, number][] = [
    ["workout", s.workout],
    ["NF",      s.nf],
    ["videos",  s.video],
    ["journal", s.journal],
  ];
  ranked.sort((a, b) => b[1] - a[1]);
  return ranked[0][0];
}
