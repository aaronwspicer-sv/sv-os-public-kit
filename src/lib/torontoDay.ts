// Single source of truth for "today" in the OWNER'S timezone. Used by:
//   - /api/notion/log GET + POST (find/upsert today's entry)
//   - Alfred's update_today_log tool
//   - Both cron jobs (morning-brief, evening-recap)
//   - Anywhere else that needs a strict local calendar day
//
// The timezone comes from config.locale.timezone (defaults to
// America/Toronto). The function names keep the "toronto" prefix for
// back-compat with ~29 call sites — but they are FULLY timezone-agnostic
// and work for any IANA zone the owner configures.
//
// STRICT midnight rollover. No 6am "still yesterday" trick — that caused
// log entries created in the 0–6am window to overwrite the previous day's
// row instead of creating a new one for the real calendar day.
//
// NOTE: the "en-CA" locale used below is an IMPLEMENTATION DETAIL, not a
// display choice — it formats dates as ISO "YYYY-MM-DD", which is the key
// used for Notion log titles + streak math. It must NOT be swapped for the
// user's display locale or every date key breaks.
import { config } from "@/config";

const TZ = () => config.locale.timezone;

export interface TorontoDayBounds {
  /** YYYY-MM-DD in the owner's timezone */
  label: string;
  /** ISO start of the local day in UTC (DST-aware) */
  start: string;
  /** ISO end (next local midnight, DST-aware → 23h/25h on transition days) */
  end: string;
}

/**
 * UTC offset (in minutes) for the configured timezone at a given instant.
 * Negative when behind UTC (e.g. EDT -240, EST -300). DST-aware via
 * Intl `longOffset` — works for any IANA zone, no month guessing.
 */
export function torontoUtcOffsetMinutes(at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ(),
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const offsetPart = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  // Format is "GMT-04:00", "GMT+09:00", or rarely "GMT" (= +00:00)
  const m = offsetPart.match(/GMT(?:([+-])(\d{2}):?(\d{2}))?/);
  if (!m || !m[1]) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
}

/**
 * Local midnight for a given YYYY-MM-DD label, as an ISO UTC string.
 * DST-aware for any zone.
 */
export function torontoMidnightUtcIso(label: string): string {
  // Probe at noon UTC on that date — inside the target local day regardless
  // of DST offset, so we read the offset cleanly.
  const probe = new Date(`${label}T12:00:00Z`);
  const offsetMin = torontoUtcOffsetMinutes(probe);
  // local-midnight-UTC = labelT00:00Z - offsetMin (offsetMin negative behind UTC)
  const localMidnightUtcMs = Date.parse(`${label}T00:00:00Z`) - offsetMin * 60_000;
  return new Date(localMidnightUtcMs).toISOString();
}

export function torontoTodayBounds(): TorontoDayBounds {
  // en-CA = ISO YYYY-MM-DD key (implementation detail, see file header)
  const label = new Date().toLocaleDateString("en-CA", { timeZone: TZ() });
  const start = torontoMidnightUtcIso(label);
  // Compute next-day midnight independently so DST spring-forward (23h day)
  // and fall-back (25h day) land correctly. Naive +24h misplaces the boundary.
  const nextLabel = nextTorontoDayLabel(label);
  const end = torontoMidnightUtcIso(nextLabel);
  return { label, start, end };
}

/** YYYY-MM-DD in the owner's timezone for `new Date()` or a passed-in ISO. */
export function torontoDay(iso?: string | Date): string {
  return new Date(iso ?? Date.now()).toLocaleDateString("en-CA", { timeZone: TZ() });
}

/** Day-of-week in the owner's timezone: 0=Sun .. 6=Sat. */
export function torontoDayOfWeek(at: Date = new Date()): number {
  // en-US weekday short names map to the English lookup array — also an
  // implementation detail, not a display-locale choice.
  const wkd = new Intl.DateTimeFormat("en-US", { timeZone: TZ(), weekday: "short" }).format(at);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wkd);
}

function nextTorontoDayLabel(label: string): string {
  // Adding 24h to labelT12:00Z always lands on the next local calendar day
  // (never crosses two days, regardless of DST).
  const next = new Date(Date.parse(`${label}T12:00:00Z`) + 24 * 60 * 60 * 1000);
  return next.toLocaleDateString("en-CA", { timeZone: TZ() });
}
