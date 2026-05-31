// Returns upcoming events from all the user's connected iCal feeds.
// Used by the calendar page agenda strip (and anywhere else that needs
// to show events to the browser — Alfred reads server-side via the lib).
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getUpcomingEvents } from "@/lib/calendar";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const days = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get("days") ?? 7)));
  const events = await getUpcomingEvents(supabase, user.id, days);
  return NextResponse.json({
    count: events.length,
    events: events.map(e => ({
      title:    e.title,
      start:    e.start,
      end:      e.end,
      allDay:   e.allDay,
      source:   e.source ?? null,
      location: e.location ?? null,
    })),
  });
}
