// Single source of truth for SV content pillars (Season 1 brand).
// Client-safe: pure constants + a normalizer, no server-only imports.
//
// Old Notion values (Journey/Process/Proof/Lessons, plus the brand-doc §8
// alt label "Income & Business") are mapped onto the 3 new pillars at read
// time, so existing records keep working without a destructive backfill.
// Notion auto-creates the new select options the first time the app writes
// one, so no manual Notion schema change is needed either.
export type Pillar = "Building AI Systems" | "Freedom Building" | "Life & Experiments";

export const PILLARS: Pillar[] = ["Building AI Systems", "Freedom Building", "Life & Experiments"];

// Yellow = building/tech/momentum (S1 accent), green = money/freedom/results,
// purple = life/experiments.
export const PILLAR_COLOR: Record<string, string> = {
  "Building AI Systems": "#FFEA00",
  "Freedom Building": "#34d399",
  "Life & Experiments": "#a78bfa",
};

const PILLAR_ALIASES: Record<string, Pillar> = {
  "Process": "Building AI Systems",
  "Proof": "Building AI Systems",
  "Journey": "Freedom Building",
  "Income & Business": "Freedom Building",
  "Lessons": "Life & Experiments",
};

export function normalizePillar(raw: string | null | undefined): Pillar {
  if (!raw) return "Building AI Systems";
  if ((PILLARS as string[]).includes(raw)) return raw as Pillar;
  return PILLAR_ALIASES[raw] ?? "Building AI Systems";
}
