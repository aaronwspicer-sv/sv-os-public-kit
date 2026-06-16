// The content-pipeline knowledge corpus. The self-doc generator runs on THIS —
// not generic content sense — so its drafts follow real ideation logic,
// packaging rules, scripting approach, and algorithm mechanics. Distilled from
// the YouTube-algorithm reference.
//
// This file is intentionally OWNER-AGNOSTIC: it's universal creator mechanics,
// safe to ship in the self-host kit. The owner's specific pillars, positioning,
// and VOICE are NOT hardcoded here — the generator appends the owner profile
// (the SV-GPT skill) separately, which supplies all of that. Keep brand/strategy
// out of this file so it stays reusable.
export const PIPELINE_KNOWLEDGE = `
DOCUMENTING A BUILD:
If you build in public, document the REAL build — the wall you hit, the fix, the
result. Not just the win, not just the process: the full arc. The tools shown are
actual infrastructure, never demos. The specific build is the discovery hook; the
ongoing story is the retention mechanism.

IDEATION — finding the gap (the idea matters more than the execution):
- YouTube is a search engine for boredom. Viewers come for answers. One great idea
  in mediocre packaging beats great production with a bad idea.
- Supply vs demand: find HIGH demand + LOW supply = untapped audience.
- Keyword choice = audience choice. The same video with a different title targets a
  completely different audience.
- Three viewer groups — design the idea to hit all three:
  · Regular viewers — already in the niche; quality matters most.
  · Casual viewers — will watch if the idea hooks them; idea + quality.
  · New viewers — don't usually watch the niche; a compelling idea pulls them in.
    THE IDEA IS EVERYTHING HERE. This is where channel growth lives.
- Find the gap: notice what's MISSING in the niche; study competitor outliers and
  ask WHY they over-performed (angle? keyword? format?); transplant a format that
  works in an adjacent niche but nobody has applied here yet.

PACKAGING & TITLES:
- Cold-audience titles: specific and searchable enough for the algorithm to
  distribute. NO series names, NO brand references in the title — the specific
  build is the discovery hook; the brand story is the retention mechanism.
- Title to the audience you want; the keyword decides who it reaches.
- Thumbnail: stopping power, clarity, emotion, contrast. It earns the click.

SCRIPTING & RETENTION:
- Hook first. Earn the next 30 seconds, then the next.
- Payoff-delay: deliver the answer as LATE as possible while keeping them watching.
  Everything before the payoff is storytelling. Early payoff = they leave. Late
  payoff (while retaining) = the algorithm signal that distributes the video.

SHORT-FORM:
- Clips from the long-form only. Minimal extra work per video. Each clip needs its
  own hook in the first second + the timestamp it's pulled from.

VOICE & PILLARS:
- Use the OWNER PROFILE (appended separately) for the owner's voice, content
  pillars, and positioning. Draft in THEIR voice — never a generic creator voice —
  and map each concept to the pillar that fits their strategy.
`.trim();
