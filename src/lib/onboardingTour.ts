// Content for the Alfred-guided walkthrough (src/components/onboarding/GuidedTour.tsx).
// Runs after the security wizard for new owners, and powers the public demo.
// Alfred is the hero (matches the marketing: "Meet Alfred. Your right
// hand."). He doesn't just show the dashboard — he runs it. Keep each line
// short. Only pages that are in the real nav + render in demo are included.

export type TourItem = { name: string; desc: string };

export type TourStop = {
  id: string;
  route: string;        // page this stop is about (the tour navigates here)
  title: string;        // page name
  alfred: string;       // Alfred's one-line intro, human voice
  items?: TourItem[];   // what each main component on the page does
  note?: string;        // optional one-liner
};

export const TOUR_INTRO =
  "Hey — I'm Alfred, the AI that runs this whole thing. I can see everything in here — your money, goals, habits, content, calendar — and I don't just show it to you, I act on it. Talk to me anytime, by text or voice. Let me give you the tour.";

export const TOUR_OUTRO =
  "That's the tour — but the dashboard's really just what I run. The magic is talking to me. Tap the ✦ in the corner and ask me anything. Let's go.";

// Shown only when the owner's Notion isn't linked yet (gated on /api/health/setup).
export const NOTION_SETUP_STOP: TourStop = {
  id: "connect-notion",
  route: "/d/settings",
  title: "Connect your data",
  alfred:
    "One setup thing first — your log, goals, money, and content live in your own Notion databases. If a page looks empty, it's just not linked yet.",
  items: [
    { name: "Notion link", desc: "paste your database IDs in your env (or Settings) and everything starts flowing to me." },
  ],
};

export const ROOM_STOPS: TourStop[] = [
  {
    id: "home",
    route: "/d",
    title: "Home",
    alfred: "This is home base — your whole life at a glance, and where I flag what actually needs you today.",
    items: [
      { name: "Net Worth", desc: "what you're worth right now, updated daily." },
      { name: "Today's Tasks", desc: "what you planned to get done." },
      { name: "Streaks", desc: "how many days running you've held each habit." },
      { name: "Life GPA", desc: "one score for how you're doing across health, money, and work." },
    ],
  },
  {
    id: "entry",
    route: "/d/entry",
    title: "Daily Entry",
    alfred: "Your daily check-in. Tick your habits, journal your day — a minute. I read every entry; it's how I actually get to know you.",
    items: [
      { name: "Habits", desc: "tick your four for the day." },
      { name: "Hours & Views", desc: "log how much you worked and how your content did." },
      { name: "Journal", desc: "a few lines on the day — I use these in your reviews." },
    ],
  },
  {
    id: "goals",
    route: "/d/goals",
    title: "Goals",
    alfred: "What you're chasing — today's, and the bigger stuff. Set them and I'll track them, bring them up in reviews, and nudge you when you drift.",
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
    alfred: "Every dollar in one place. I categorize your transactions, track your net worth, and answer 'where's my money going' so you don't have to dig.",
    items: [
      { name: "Net Worth History", desc: "how your worth's moved over time." },
      { name: "To Review", desc: "transactions I wasn't sure about — confirm in a tap." },
      { name: "Transactions & Burn", desc: "everything sorted, plus what you spend a month." },
    ],
    note: "In the real OS this sits behind a vault (PIN + 2FA + biometric) — here it's simulated.",
  },
  {
    id: "content",
    route: "/d/content",
    title: "Content",
    alfred: "Your video pipeline, idea to posted. I track every stage so nothing stalls, and I can tell you what's actually working.",
    items: [
      { name: "In flight", desc: "what you're working on right now." },
      { name: "Stuck", desc: "videos that stalled, so nothing rots." },
      { name: "Top performers", desc: "what's landing, by the numbers." },
    ],
  },
  {
    id: "timeline",
    route: "/d/timeline",
    title: "Timeline",
    alfred: "Your days laid out in order — every entry and photo. From here you can jump into your whole year in numbers.",
    items: [
      { name: "Your days", desc: "everything you've logged, newest first." },
      { name: "Year stats", desc: "tap through for the full year — habits, money, output." },
    ],
  },
];
