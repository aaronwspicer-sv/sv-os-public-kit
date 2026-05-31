import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

// POST /api/timeline/photos
// Accepts photo data from iOS/macOS Shortcut. Either a single object or an array.
// Body: { externalId, takenAt, caption?, placeName?, latitude?, longitude?, imageUrl?, thumbnail? }
// thumbnail = base64 data URL ("data:image/jpeg;base64,...") — keep small (≤200px wide)

interface PhotoInput {
  externalId: string;          // iCloud asset identifier — used for dedup
  takenAt: string;             // ISO datetime
  caption?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;           // optional full-res hosted URL
  thumbnail?: string;          // base64 data URL or absolute URL
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json();
  const items: PhotoInput[] = Array.isArray(body) ? body : Array.isArray(body.photos) ? body.photos : [body];

  if (items.length === 0) return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  if (items.length > 100)  return NextResponse.json({ error: "Max 100 per batch" }, { status: 400 });

  const rows = items.map(p => ({
    user_id:     user.id,
    external_id: p.externalId,
    taken_at:    p.takenAt,
    caption:     p.caption ?? null,
    place_name:  p.placeName ?? null,
    latitude:    p.latitude ?? null,
    longitude:   p.longitude ?? null,
    image_url:   p.imageUrl ?? null,
    thumbnail:   p.thumbnail ?? null,
    source:      "shortcut",
  })).filter(r => r.external_id && r.taken_at);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Each photo needs externalId and takenAt" }, { status: 400 });
  }

  const { error } = await supabase
    .from("timeline_photos")
    .upsert(rows, { onConflict: "user_id,external_id" });

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data } = await supabase
    .from("timeline_photos")
    .select("*")
    .eq("user_id", user.id)
    .order("taken_at", { ascending: false })
    .limit(500);

  return NextResponse.json({ photos: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await supabase.from("timeline_photos").delete().eq("user_id", user.id).eq("id", id);
  return NextResponse.json({ ok: true });
}
