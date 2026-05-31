// Dynamic OG image for /u/<slug>. Uses Next's ImageResponse (edge).
import { ImageResponse } from "next/og";
import { fetchPublicProfile, computePublicStats } from "@/lib/publicProfile";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { config } from "@/config";

export const runtime = "nodejs"; // we use the Notion + service-role clients
export const alt = "Character sheet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchPublicProfile(slug);
  if (!profile) {
    return new ImageResponse(
      (
        <div style={{ background: "#000", color: "#fff", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
          Not found
        </div>
      ),
      size,
    );
  }
  const stats = await computePublicStats(profile.userId);
  const unlockedCount = ACHIEVEMENTS.filter(a => a.check(stats)).length;
  const name = profile.displayName ?? profile.slug;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #000 0%, #0a0f1a 50%, #0a0a18 100%)",
          color: "#fff",
          padding: 64,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 18, letterSpacing: 4, color: "#6b7280", textTransform: "uppercase" }}>
            Character Sheet
          </div>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1, marginTop: 8 }}>{name}</div>
          {profile.title && (
            <div style={{ fontSize: 32, color: "#1d9bf0", fontWeight: 600, marginTop: 8 }}>{profile.title}</div>
          )}
          {profile.tagline && (
            <div style={{ fontSize: 22, color: "#a1a1aa", marginTop: 12, maxWidth: 1000 }}>{profile.tagline}</div>
          )}
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          <Stat label="Days Logged"   value={stats.daysLogged} />
          <Stat label="Lifetime Hours" value={stats.totalHours} />
          <Stat label="Workouts"       value={stats.totalWorkouts} />
          <Stat label="Videos"         value={stats.videosPublished} />
          <Stat label="Achievements"   value={`${unlockedCount}/${ACHIEVEMENTS.length}`} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, color: "#6b7280", fontSize: 16, letterSpacing: 3, textTransform: "uppercase" }}>
          <span>{config.brand.domain}/u/{profile.slug}</span>
          <span style={{ color: "#1d9bf0" }}>{config.brand.name}</span>
        </div>
      </div>
    ),
    size,
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "18px 26px",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 14, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
