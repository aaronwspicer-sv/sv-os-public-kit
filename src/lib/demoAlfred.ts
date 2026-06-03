// Canned Alfred answers for the PUBLIC demo (config.isPublicDemo). No live API
// — every answer is scripted (free, abuse-proof, always lands) and can be
// SPOKEN via a pre-recorded clip (generate with `npm run gen-demo-audio`).
// Voice = plain, references the demo data, addresses the visitor generally.

export type DemoQA = { id: string; prompt: string; match: RegExp; answer: string };

export const DEMO_QA: DemoQA[] = [
  {
    id: "focus",
    prompt: "What should I focus on today?",
    match: /focus|today|priorit|do first/i,
    answer:
      "You've logged 3 days straight — momentum's real. Two things matter today: that unreviewed Costco charge (2 minutes, knock it out first), and you're 1 of 3 videos toward your monthly goal. Everything else can wait. Want me to block time for the edit?",
  },
  {
    id: "month",
    prompt: "How's my month going?",
    match: /month|going|how am i|how'?s it|doing|track/i,
    answer:
      "Strong. $3,600 in, $1,240 out — net positive, and your net worth's at $47,832. Content's at 847K lifetime views. Habits are the soft spot this week: gym's at 1 of 4. Not a crisis, just the thing to watch.",
  },
  {
    id: "money",
    prompt: "Where's my money actually going?",
    match: /money|spend|spending|budget|leak|cost|expense/i,
    answer:
      "Top three this year: Food & Dining ($8.2K), Transportation ($4.1K), Software ($2.8K). Food's the one worth a look — almost double transport. Want me to flag anything over $50 next month so it's not invisible?",
  },
  {
    id: "remember",
    prompt: "Remember I want to launch by March.",
    match: /remember|launch|march|goal|commit/i,
    answer:
      "Got it — logged as a commitment. I'll work it into your weekly reviews and flag if your pace drifts. This is the kind of thing I'll bring up before you even ask.",
  },
];

export const DEMO_FALLBACK: DemoQA = {
  id: "fallback",
  prompt: "",
  match: /.^/, // never matches — used only as the default
  answer:
    "In the real OS I'd pull this straight from your data and answer for real — finances, goals, calendar, all of it. This is just a demo, so I'm sticking to a few canned questions. Tap one of the suggestions to see how I work, then build your own and ask me anything.",
};

export const DEMO_ALFRED_PROMPTS = DEMO_QA.map((q) => q.prompt);

export function cannedAlfred(text: string): { id: string; answer: string } {
  for (const q of DEMO_QA) if (q.match.test(text)) return { id: q.id, answer: q.answer };
  return { id: DEMO_FALLBACK.id, answer: DEMO_FALLBACK.answer };
}

/** Static pre-recorded clip for a canned answer (generate with gen-demo-audio).
 *  No-ops gracefully in the UI if the file isn't present. */
export function demoAudioSrc(id: string): string {
  return `/demo-alfred/${id}.mp3`;
}

// Back-compat for any string-only callers.
export function cannedAlfredAnswer(text: string): string {
  return cannedAlfred(text).answer;
}
