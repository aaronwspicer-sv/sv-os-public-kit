// Owner-only CRUD for the user's public_profiles row. Used by the Settings panel.
// GET: returns current row or null.
// PUT: upserts. Validates slug (a–z, 0–9, _, -, 1–40 chars) and rejects reserved
// slugs to avoid conflicts with app routes.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

const RESERVED = new Set([
  "api", "auth", "login", "logout", "settings", "admin", "u",
  "calendar", "content", "finances", "goals", "jays", "log", "timeline",
  "year", "ideas", "wishlist", "security", "manual-assets", "account-map",
  "shortcuts",
]);

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase
    .from("public_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ profile: data ?? null });
}

export async function PUT(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const slugRaw = String(body.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(slugRaw)) {
    return NextResponse.json({ error: "Slug must be 1–40 chars (a–z, 0–9, _, -)" }, { status: 400 });
  }
  if (RESERVED.has(slugRaw)) {
    return NextResponse.json({ error: "That slug is reserved" }, { status: 400 });
  }

  // Field-by-field whitelist — never trust shape blindly
  const row = {
    user_id:           user.id,
    slug:              slugRaw,
    display_name:      str(body.display_name, 80),
    title:             str(body.title, 80),
    tagline:           str(body.tagline, 140),
    location:          str(body.location, 80),
    avatar_url:        url(body.avatar_url),
    bio:               str(body.bio, 600),
    skills:            sanitizeSkills(body.skills),
    show_streaks:      !!body.show_streaks,
    show_achievements: !!body.show_achievements,
    show_quests:       !!body.show_quests,
    show_battle_log:   !!body.show_battle_log,
    show_skills:       !!body.show_skills,
    updated_at:        new Date().toISOString(),
  };

  // Enforce slug uniqueness (other users can't claim ours; we can't take theirs)
  const { data: existing } = await supabase
    .from("public_profiles")
    .select("user_id")
    .eq("slug", slugRaw)
    .maybeSingle();
  if (existing && existing.user_id !== user.id) {
    return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  }

  const { error } = await supabase
    .from("public_profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    console.error("Profile upsert failed:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, slug: slugRaw });
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}
function url(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString().slice(0, 500);
  } catch { return null; }
}
function sanitizeSkills(v: unknown): { name: string; level: number }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map(s => {
      if (!s || typeof s !== "object") return null;
      const name = str((s as any).name, 30);
      const lvl  = Number((s as any).level);
      if (!name || !Number.isFinite(lvl)) return null;
      return { name, level: Math.max(0, Math.min(100, Math.round(lvl))) };
    })
    .filter((x): x is { name: string; level: number } => !!x)
    .slice(0, 12);
}
