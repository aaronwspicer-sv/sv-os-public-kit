// Content for the Alfred-guided walkthrough (src/components/onboarding/GuidedTour.tsx).
// Runs after the security wizard for new owners, and powers the public demo
// (rooms only). Voice = Alfred talking like a person, not a product tour.
// Keep each line short — thorough but never a wall of text.

export type TourItem = { name: string; desc: string };

export type TourStop = {
  id: string;
  route: string;        // page this stop is about (used by "Open page" + demo nav)
  title: string;        // page name
  alfred: string;       // Alfred's one-line intro, human voice
  items?: TourItem[];   // what each main component on the page does
  note?: string;        // optional one-liner (e.g. how to switch it on)
};

export const TOUR_INTRO =
  "Hey — I'm Alfred. I can see everything in here: your money, goals, habits, content, calendar. Talk to me whenever, type or voice. Give me a minute and I'll show you around.";

export const TOUR_OUTRO =
  "That's the tour. Easiest way to start is just tell me what you did today and I'll log it. And seriously — anything you need, just ask. Let's go.";

// Shown only when the owner's Notion isn't linked yet (gated on /api/health/setup).
export const NOTION_SETUP_STOP: TourStop = {
  id: "connect-notion",
  route: "/d/settings",
  title: "Connect your data",
  alfred:
    "One setup thing first — your log, goals, money, and content all live in your own Notion databases. If a page looks empty, it's just not linked yet.",
  items: [
    { name: "Notion link", desc: "paste your database IDs in your env (or Settings) and everything starts flowing." },
  ],
};

export const ROOM_STOPS: TourStop[] = [
  {
    id: "home",
    route: "/d",
    title: "Home",
    alfred: "This is home base — your whole life at a glance. You'll start here every day.",
    items: [
      { name: "Net Worth", desc: "what you're worth right now, updated daily." },
      { name: "Today's Tasks", desc: "what you planned to get done today." },
      { name: "Streaks", desc: "how many days running you've kept each habit." },
      { name: "Life GPA", desc: "one score for how you're doing across health, money, and work." },
    ],
  },
  {
    id: "entry",
    route: "/d/entry",
    title: "Daily Entry",
    alfred: "This is the one that matters — your daily check-in. A minute, tops.",
    items: [
      { name: "Habits", desc: "tick your four for the day." },
      { name: "Hours & Views", desc: "log how much you worked and how your content did." },
      { name: "Journal", desc: "a few lines on the day — I read these for your reviews." },
    ],
    note: "Do this daily and everything else kind of fills itself in.",
  },
  {
    id: "goals",
    route: "/d/goals",
    title: "Goals",
    alfred: "Two kinds of goals live here — today's, and the bigger stuff you're chasing.",
    items: [
      { name: "Today", desc: "your goals for the day." },
      { name: "Queue", desc: "things lined up for later." },
      { name: "Plan tomorrow", desc: "set tomorrow up before you sleep." },
    ],
  },
  {
    id: "finances",
    route: "/d/finances",
    title: "Finances",
    alfred: "All your money in one place — kept behind a lock, on purpose.",
    items: [
      { name: "Net Worth History", desc: "how your worth's moved over time." },
      { name: "To Review", desc: "transactions I wasn't sure about — confirm them in a tap." },
      { name: "Transactions & Burn", desc: "everything sorted, plus what you spend a month." },
    ],
    note: "Nothing showing? Unlock the vault with 2FA and drop in a bank CSV — I'll sort the rest.",
  },
  {
    id: "content",
    route: "/d/content",
    title: "Content",
    alfred: "Your video pipeline, from idea to posted.",
    items: [
      { name: "In flight", desc: "what you're working on right now." },
      { name: "Stuck", desc: "videos that stalled, so nothing rots." },
      { name: "Top performers", desc: "what's actually working, by the numbers." },
    ],
  },
  {
    id: "time",
    route: "/d/time",
    title: "Time",
    alfred: "Track where your hours actually go. It's never quite where you think.",
    items: [
      { name: "Log Time", desc: "add a block — project plus how long." },
      { name: "By Project", desc: "your time split across everything." },
    ],
  },
  {
    id: "year",
    route: "/d/year",
    title: "Year",
    alfred: "Zoom all the way out — your whole year on one screen.",
    items: [
      { name: "Year at a Glance", desc: "habits, money, and output for the year." },
      { name: "Peak Day", desc: "your single most productive day." },
    ],
    note: "It updates itself as you log.",
  },
];
