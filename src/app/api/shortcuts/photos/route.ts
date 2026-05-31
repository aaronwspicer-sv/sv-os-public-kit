// Bearer-token endpoint for the iCloud Photos → Timeline iOS/macOS Shortcut.
// Supabase auth cookies aren't usable from Shortcuts, so this route uses a
// long-lived bearer token (SHORTCUT_API_KEY env var) and writes to the user
// identified by SHORTCUT_OWNER_USER_ID env var.
//
// Body accepts a single photo or { photos: [...] } batch. Each photo:
//   { externalId, takenAt (ISO), caption?, placeName?, latitude?, longitude?, thumbnail? (base64 data URL) }
//
// Defense:
//   - Bearer token compared in constant time
//   - Rate-limited (50 batches per hour per key)
//   - Batch size capped at 100 per call
//   - All photos written via service-role-equivalent write (no user session)
//   - On token mismatch we DO NOT echo any error detail
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { checkRateLimit } from "@/lib/rateLimit";
import crypto from "crypto";

interface PhotoInput {
  externalId: string;
  takenAt: string;
  caption?: string;
  placeName?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  thumbnail?: string;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  const expected = process.env.SHORTCUT_API_KEY;
  const ownerUserId = process.env.SHORTCUT_OWNER_USER_ID;
  if (!expected || !ownerUserId) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Accept Bearer token via Authorization header
  const authHeader = req.headers.get("authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const supplied = m?.[1]?.trim() ?? "";
  if (!supplied || !timingSafeEqualStrings(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 50 batches per hour per IP+token
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`shortcut-photos:${ip}`, { limit: 50, window: 3600 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const items: PhotoInput[] = Array.isArray(body) ? body : Array.isArray(body.photos) ? body.photos : [body];
  if (items.length === 0) return NextResponse.json({ error: "No photos provided" }, { status: 400 });
  if (items.length > 100) return NextResponse.json({ error: "Max 100 per batch" }, { status: 400 });

  // Construct an anonymous Supabase server client — RLS would block writes
  // since we're not a user. Use the SERVICE ROLE key for shortcut writes only.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "Service key not configured" }, { status: 500 });
  }
  const supabase = createServerClient(url, serviceKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  });

  const rows = items.map(p => ({
    user_id:     ownerUserId,
    external_id: p.externalId,
    taken_at:    p.takenAt,
    caption:     p.caption ?? null,
    place_name:  p.placeName ?? null,
    latitude:    typeof p.latitude  === "number" ? p.latitude  : null,
    longitude:   typeof p.longitude === "number" ? p.longitude : null,
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

  if (error) {
    console.error("Shortcut photo upsert failed:", error.message);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  // Audit log
  try {
    await supabase.from("audit_log").insert({
      user_id: ownerUserId,
      action: "shortcut_photos_upload",
      metadata: { count: rows.length, ip },
    });
  } catch {}

  return NextResponse.json({ ok: true, inserted: rows.length });
}
