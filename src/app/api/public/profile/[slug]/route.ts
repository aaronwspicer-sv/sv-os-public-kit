// PUBLIC endpoint — no auth. Serves the character-sheet view at /u/<slug>.
// Only returns whitelisted fields from public_profiles + computed stats
// + unlocked achievements. Rate-limited to defeat scraping.
import { NextRequest, NextResponse } from "next/server";
import { fetchPublicProfile, computePublicStats } from "@/lib/publicProfile";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { checkRateLimit } from "@/lib/rateLimit";

export const revalidate = 300; // 5-minute cache at the edge

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || !/^[a-z0-9_-]{1,40}$/i.test(slug)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`public-profile:${ip}`, { limit: 60, window: 60 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const profile = await fetchPublicProfile(slug);
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stats = await computePublicStats(profile.userId);
  const unlocked = ACHIEVEMENTS.filter(a => a.check(stats)).map(a => ({
    id: a.id, icon: a.icon, name: a.name, description: a.description,
  }));

  return NextResponse.json({ profile, stats, achievements: unlocked });
}
