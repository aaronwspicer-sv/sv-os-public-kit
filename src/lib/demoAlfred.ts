// Canned Alfred answers for the PUBLIC demo (config.isPublicDemo). No API
// calls — every answer is scripted so it's free, abuse-proof, and always
// lands. Voice = plain, references the demo data, addresses "Aaron" (it's his
// OS on display). Matched loosely by keyword; falls back to a gentle nudge.

export const DEMO_ALFRED_PROMPTS = [
  "What should I focus on today?",
  "How's my month going?",
  "Where's my money actually going?",
  "Remember I want to launch by March.",
];

const ANSWERS: { match: RegExp; answer: string }[] = [
  {
    match: /focus|today|priorit|do first/i,
    answer:
      "You've logged 3 days straight — momentum's real. Two things matter today: that unreviewed Costco charge (2 minutes, knock it out first), and you're 1 of 3 videos toward your monthly goal. Everything else can wait. Want me to block time for the edit?",
  },
  {
    match: /month|going|how am i|how'?s it|doing|track/i,
    answer:
      "Strong. $3,600 in, $1,240 out — net positive, and your net worth's at $47,832. Content's at 847K lifetime views. Habits are the soft spot this week: gym's at 1 of 4. Not a crisis, just the thing to watch.",
  },
  {
    match: /money|spend|spending|budget|leak|cost|expense/i,
    answer:
      "Top three this year: Food & Dining ($8.2K), Transportation ($4.1K), Software ($2.8K). Food's the one worth a look — almost double transport. Want me to flag anything over $50 next month so it's not invisible?",
  },
  {
    match: /remember|launch|march|goal|commit/i,
    answer:
      "Got it — logged as a commitment. I'll work it into your weekly reviews and flag if your pace drifts. This is the kind of thing I'll bring up before you even ask.",
  },
];

const FALLBACK =
  "In the real OS I'd pull this straight from your data and answer for real — finances, goals, calendar, all of it. This is just a demo, so I'm sticking to a few canned questions. Tap one of the suggestions to see how I work, then build your own and ask me anything.";

export function cannedAlfredAnswer(text: string): string {
  for (const a of ANSWERS) if (a.match.test(text)) return a.answer;
  return FALLBACK;
}
