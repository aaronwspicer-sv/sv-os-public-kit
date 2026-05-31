// Read-access for Google Calendar via secret iCal feed URLs.
// URLs are stored per-user in `user_calendars`, encrypted at rest with the
// existing ENCRYPTION_KEY scheme (matches plaid_items pattern).
//
// SETUP — for each calendar Aaron wants Alfred to see:
//   1. Google Calendar → 3-dot menu on the calendar in left sidebar
//      → "Settings and sharing"
//   2. Scroll to "Integrate calendar"
//   3. Copy "Secret address in iCal format" (https://calendar.google.com/.../ical/.../basic.ics)
//   4. In Spicer OS Settings → "Calendar feeds" → paste URL + label → Save
//
// Cache: in-memory 60s per process. Google's ICS feed sometimes lags
// ~5-15 min behind real changes — fine for brief/Alfred use cases.
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { torontoUtcOffsetMinutes } from "@/lib/torontoDay";
import { config } from "@/config";

export interface CalEvent {
  title: string;
  start: string;     // ISO
  end:   string;     // ISO
  allDay: boolean;
  location?: string;
  description?: string;
  source?: string;   // calendar label
}

const cache = new Map<string, { fetchedAt: number; events: CalEvent[] }>();
const CACHE_MS = 60 * 1000;

function parseIcsDate(value: string): { iso: string; allDay: boolean } | null {
  const m = value.match(/^(?:VALUE=DATE:)?(\d{8})(?:T(\d{6})(Z)?)?$/);
  if (!m) return null;
  const [, d, t, z] = m;
  const y = d.slice(0, 4), mo = d.slice(4, 6), da = d.slice(6, 8);
  if (!t) return { iso: `${y}-${mo}-${da}T12:00:00Z`, allDay: true };
  const hh = t.slice(0, 2), mm = t.slice(2, 4), ss = t.slice(4, 6);
  if (z) return { iso: `${y}-${mo}-${da}T${hh}:${mm}:${ss}Z`, allDay: false };
  // Floating local time — assume Toronto, convert to UTC.
  // Use the real America/Toronto offset for THIS date (DST-aware) instead
  // of the old month-based heuristic, which was wrong for the first ~2
  // weeks of March and the last week of October every year.
  const naiveUtc = new Date(`${y}-${mo}-${da}T${hh}:${mm}:${ss}Z`);
  const offsetMin = torontoUtcOffsetMinutes(naiveUtc); // negative
  // Local = UTC + offsetMin ⇒ UTC of the floating moment = naiveUtc - offsetMin
  return { iso: new Date(naiveUtc.getTime() - offsetMin * 60_000).toISOString(), allDay: false };
}

function unfold(ics: string): string[] {
  const lines = ics.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

export function parseIcs(text: string, source?: string): CalEvent[] {
  const lines = unfold(text);
  const events: CalEvent[] = [];
  let inEvent = false;
  let cur: Partial<CalEvent> & { _start?: string; _end?: string; _allDay?: boolean } = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") { inEvent = true; cur = {}; continue; }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (cur._start) {
        events.push({
          title:    cur.title ?? "(untitled)",
          start:    cur._start,
          end:      cur._end ?? cur._start,
          allDay:   !!cur._allDay,
          location: cur.location,
          description: cur.description,
          source,
        });
      }
      continue;
    }
    if (!inEvent) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const lhs = line.slice(0, idx);
    const val = line.slice(idx + 1);
    const key = lhs.split(";")[0].toUpperCase();
    const params = lhs.includes(";") ? lhs.slice(lhs.indexOf(";") + 1) : "";

    if (key === "SUMMARY") cur.title = unescape(val);
    else if (key === "LOCATION") cur.location = unescape(val);
    else if (key === "DESCRIPTION") cur.description = unescape(val);
    else if (key === "DTSTART") {
      const isDateOnly = params.toUpperCase().includes("VALUE=DATE");
      const parsed = parseIcsDate(isDateOnly ? `VALUE=DATE:${val}` : val);
      if (parsed) { cur._start = parsed.iso; cur._allDay = parsed.allDay; }
    }
    else if (key === "DTEND") {
      const isDateOnly = params.toUpperCase().includes("VALUE=DATE");
      const parsed = parseIcsDate(isDateOnly ? `VALUE=DATE:${val}` : val);
      if (parsed) cur._end = parsed.iso;
    }
  }
  return events;
}

interface UserCalRow { id: string; label: string; ical_url_enc: string }

async function fetchUserCalendars(sb: SupabaseClient, userId: string): Promise<{ label: string; url: string }[]> {
  const { data } = await sb
    .from("user_calendars")
    .select("id, label, ical_url_enc")
    .eq("user_id", userId);
  if (!data) return [];
  const out: { label: string; url: string }[] = [];
  for (const row of data as UserCalRow[]) {
    try {
      out.push({ label: row.label, url: decryptToken(row.ical_url_enc) });
    } catch {}
  }
  return out;
}

async function getAllEvents(sb: SupabaseClient, userId: string): Promise<CalEvent[]> {
  const key = `u:${userId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit.events;
  const feeds = await fetchUserCalendars(sb, userId);
  if (feeds.length === 0) {
    cache.set(key, { fetchedAt: Date.now(), events: [] });
    return [];
  }
  const results = await Promise.all(feeds.map(async f => {
    try {
      const r = await fetch(f.url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [];
      const text = await r.text();
      return parseIcs(text, f.label);
    } catch { return []; }
  }));
  const events = results.flat();
  cache.set(key, { fetchedAt: Date.now(), events });
  return events;
}

function torontoDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}

export async function getEventsForDate(sb: SupabaseClient, userId: string, yyyymmdd: string): Promise<CalEvent[]> {
  const all = await getAllEvents(sb, userId);
  return all
    .filter(e => torontoDay(e.start) === yyyymmdd)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function getUpcomingEvents(sb: SupabaseClient, userId: string, days = 7): Promise<CalEvent[]> {
  const all = await getAllEvents(sb, userId);
  const now = Date.now();
  const cutoff = now + days * 86400 * 1000;
  return all
    .filter(e => {
      const t = new Date(e.start).getTime();
      return t >= now && t <= cutoff;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function invalidateCalendarCache(userId: string) {
  cache.delete(`u:${userId}`);
}
