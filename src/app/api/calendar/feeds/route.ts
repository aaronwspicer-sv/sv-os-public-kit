// CRUD for the user's iCal feed URLs. URLs encrypted at rest.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { encryptToken, decryptToken } from "@/lib/crypto";
import { invalidateCalendarCache, getUpcomingEvents } from "@/lib/calendar";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;
  const { data } = await supabase
    .from("user_calendars")
    .select("id, label, ical_url_enc, color, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  // Return only host + path tail of the URL so the user can verify what's saved
  // without exposing the secret query string in the UI.
  const feeds = (data ?? []).map(f => {
    let preview = "(encrypted)";
    try {
      const u = new URL(decryptToken(f.ical_url_enc));
      preview = `${u.host}${u.pathname.split("/").slice(0, 4).join("/")}/…/basic.ics`;
    } catch {}
    return { id: f.id, label: f.label, color: f.color, created_at: f.created_at, preview };
  });
  // Also surface live event count so the user can see if it's actually working
  let upcomingCount = 0;
  try {
    const evs = await getUpcomingEvents(supabase, user.id, 30);
    upcomingCount = evs.length;
  } catch {}
  return NextResponse.json({ feeds, upcomingCount });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  const url   = typeof body?.url   === "string" ? body.url.trim()   : "";
  const color = typeof body?.color === "string" ? body.color : null;
  if (!label) return NextResponse.json({ error: "Label required" }, { status: 400 });
  if (!/^https:\/\/calendar\.google\.com\/calendar\/ical\//.test(url) && !/\.ics(\?|$)/.test(url)) {
    return NextResponse.json({ error: "URL must be a Google Calendar iCal feed (https://calendar.google.com/calendar/ical/.../basic.ics)" }, { status: 400 });
  }
  // Quick fetch test so we don't store a dead URL
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return NextResponse.json({ error: `Feed returned ${r.status} — bad URL or feed not public/secret` }, { status: 400 });
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) return NextResponse.json({ error: "URL responded but isn't an iCal feed" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: `Couldn't fetch feed: ${err?.message ?? "network"}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_calendars")
    .insert({ user_id: user.id, label: label.slice(0, 60), ical_url_enc: encryptToken(url), color })
    .select("id")
    .single();
  if (error) {
    console.error("user_calendars insert failed:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  invalidateCalendarCache(user.id);
  await supabase.from("audit_log").insert({
    user_id: user.id, action: "calendar_feed_added", metadata: { id: data.id, label },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("user_calendars").delete().eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  invalidateCalendarCache(user.id);
  await supabase.from("audit_log").insert({
    user_id: user.id, action: "calendar_feed_removed", metadata: { id },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
