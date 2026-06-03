// Fixed fake data used when demo mode is active.
// Values are stable so recordings look consistent across takes.

// ── Dashboard ────────────────────────────────────────────────
export const DEMO_NET_WORTH    = 47832;
export const DEMO_WEEK_SPEND   = 1240;
export const DEMO_WEEK_INCOME  = 3600;
export const DEMO_INBOX_COUNT  = 3;
export const DEMO_INBOX_MERCHANT = "Costco Wholesale";

// ── Year stats ───────────────────────────────────────────────
export const DEMO_YEAR_INCOME  = 52400;
export const DEMO_YEAR_EXPENSE = 38100;
export const DEMO_YEAR_NET     = 14300;
export const DEMO_TOTAL_VIEWS  = 847000;

export const DEMO_TOP_CATEGORIES = [
  { category: "Food & Dining",   amount: 8200 },
  { category: "Transportation",  amount: 4100 },
  { category: "Software & Tools", amount: 2800 },
];

export const DEMO_MONTHLY = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  hours:   [120, 98, 145, 132, 156, 118, 142, 165, 138, 122, 148, 130][i],
  income:  [4200, 3800, 5100, 4400, 5600, 4100, 4900, 6200, 4800, 4100, 5300, 4700][i],
  expense: [3100, 2900, 3400, 3200, 3600, 2800, 3300, 3900, 3100, 2900, 3500, 3400][i],
  published: [2, 1, 3, 2, 4, 2, 3, 3, 2, 1, 3, 2][i],
  byPillar: { Journey: 1, Process: 1, Proof: 0, Lessons: 0 },
}));

// ── Daily log ────────────────────────────────────────────────
export const DEMO_HOURS_WORKED = 7.5;
export const DEMO_DAILY_VIEWS  = 1247;
export const DEMO_SUMMARY = "Productive day — made solid progress on the main project and hit all my habits. Good energy throughout, keeping the momentum going.";
export const DEMO_MINDSET = "Clear and focused. Showing up consistently is the whole game — results follow the process.";

// ── Goals ────────────────────────────────────────────────────
export const DEMO_TODAY_GOALS = [
  "Complete morning routine",
  "Deep work block — main project",
  "Review messages and emails",
  "Evening workout",
  "Read for 30 minutes",
];

export const DEMO_LIFE_GOAL_TITLES = [
  "Financial Independence",
  "Launch New Product",
  "Fitness Goal",
  "Build the Channel",
];

// ── Timeline ─────────────────────────────────────────────────
export const DEMO_TIMELINE_TITLE = "Strong day";
export const DEMO_TIMELINE_BODY  = "Hit all four habits, deep work session went well. Feeling locked in and consistent this week. The process is working.";
export const DEMO_TIMELINE_PLACE = "Toronto, ON";

// ── Log history ──────────────────────────────────────────────
export const DEMO_HISTORY_HOURS = 7.5;
export const DEMO_HISTORY_VIEWS = 1247;
export const DEMO_HISTORY_SUMMARY = "Productive day — solid progress on the project, hit all habits. Momentum is building.";
export const DEMO_HISTORY_MINDSET = "Clear and focused. Staying consistent with the process.";

// ── Utility helpers ──────────────────────────────────────────
// Use these inline: d(isDemoMode, real, fake)
export function d<T>(demo: boolean, real: T, fake: T): T {
  return demo ? fake : real;
}

// For indexed goal text (cycles through DEMO_TODAY_GOALS)
export function demoGoalText(index: number): string {
  return DEMO_TODAY_GOALS[index % DEMO_TODAY_GOALS.length];
}

export function demoLifeGoalTitle(index: number): string {
  return DEMO_LIFE_GOAL_TITLES[index % DEMO_LIFE_GOAL_TITLES.length];
}

// ── Content pipeline (the /d/content page) ───────────────────
// Shaped like the page's VideoEntry. Mix of Live (for top performers) +
// in-flight stages + one going live this week.
function demoVid(p: Partial<any> & { id: string; title: string; status: string; pillar: string }) {
  return {
    notionUrl: null, type: "Long Form", platform: ["YouTube"], effortLevel: "Medium",
    publishDate: null, views: 0, thumbnail: null, finalVideo: null, slug: null,
    notes: "", parentVideoId: null, shortFormClipIds: [], viralInspirationId: null,
    ...p,
  };
}
export const DEMO_VIDEOS = [
  demoVid({ id: "dv1", title: "I built my own AI to run my life", status: "Live", pillar: "Process", views: 48200, publishDate: "2026-05-20", effortLevel: "High" }),
  demoVid({ id: "dv2", title: "Why I sold my console to fund the dream", status: "Live", pillar: "Journey", views: 21400, publishDate: "2026-05-06" }),
  demoVid({ id: "dv3", title: "Building in public — month one", status: "Live", pillar: "Proof", views: 9800, publishDate: "2026-05-13" }),
  demoVid({ id: "dv4", title: "The launch video (editing now)", status: "Editing", pillar: "Process", publishDate: "2026-06-04", effortLevel: "High" }),
  demoVid({ id: "dv5", title: "30 days of showing up", status: "Filming", pillar: "Proof" }),
  demoVid({ id: "dv6", title: "What my differences taught me about leverage", status: "Scripting", pillar: "Journey" }),
  demoVid({ id: "dv7", title: "The system behind everything", status: "Idea", pillar: "Lessons" }),
];

// ── Idea inbox (the /d/content InboxTab) ─────────────────────
export const DEMO_IDEAS = [
  { id: "di1", text: "Reaction: my first paid invoice and what it unlocked", source: "voice note", promoted: false, promoted_at: null, notion_page_id: null, created_at: "2026-05-30" },
  { id: "di2", text: "Tutorial: wiring Alfred into a Notion database", source: null, promoted: false, promoted_at: null, notion_page_id: null, created_at: "2026-05-28" },
  { id: "di3", text: "Story: the 10/30 chemistry test that flipped a switch", source: null, promoted: false, promoted_at: null, notion_page_id: null, created_at: "2026-05-25" },
];
