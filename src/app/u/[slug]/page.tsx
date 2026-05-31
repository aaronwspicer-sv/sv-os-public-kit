// PUBLIC character-sheet page. No auth.
// RPG-style stat view: header (name/title/tagline), stats grid, achievements,
// streaks, skills bars. All fields gated by the owner's visibility toggles.
import { notFound } from "next/navigation";
import { fetchPublicProfile, computePublicStats } from "@/lib/publicProfile";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { Metadata } from "next";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicProfile(slug);
  if (!profile) return { title: "Not found" };
  const name = profile.displayName ?? profile.slug;
  const title = profile.title ? `${name} — ${profile.title}` : name;
  return {
    title,
    description: profile.tagline ?? profile.bio ?? `${name}'s character sheet`,
    openGraph: {
      title,
      description: profile.tagline ?? profile.bio ?? "",
      type: "profile",
    },
    twitter: { card: "summary_large_image", title, description: profile.tagline ?? "" },
  };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchPublicProfile(slug);
  if (!profile) notFound();

  const stats = await computePublicStats(profile.userId);
  const unlocked = ACHIEVEMENTS.filter(a => a.check(stats));

  const name = profile.displayName ?? profile.slug;

  return (
    <div className="min-h-screen bg-bg text-text-1">
      {/* ambient glow background */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none opacity-50"
        style={{
          background:
            "radial-gradient(800px 500px at 20% 0%, rgba(29,155,240,0.10), transparent 60%), radial-gradient(700px 500px at 80% 100%, rgba(167,139,250,0.08), transparent 60%)",
        }}
      />

      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14 flex flex-col gap-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatarUrl}
              alt=""
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-[20px] object-cover border border-[rgba(255,255,255,0.08)] shadow-[0_8px_28px_rgba(0,0,0,0.4)]"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[20px] bg-accent-dim border border-[rgba(29,155,240,0.25)] flex items-center justify-center text-[28px] font-700">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-text-3 text-[11px] uppercase tracking-[0.18em]">Character sheet</p>
            <h1 className="text-[28px] sm:text-[34px] font-700 tracking-tight leading-none">{name}</h1>
            {profile.title && <p className="text-[14px] text-accent font-600">{profile.title}</p>}
            {profile.tagline && <p className="text-[13px] text-text-2 mt-1">{profile.tagline}</p>}
            {profile.location && <p className="text-[11px] text-text-3 mt-1">📍 {profile.location}</p>}
          </div>
        </header>

        {profile.bio && (
          <div className="glass p-5">
            <p className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
          </div>
        )}

        {/* Stats grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Days Logged"     value={stats.daysLogged} />
          <Stat label="Lifetime Hours"  value={stats.totalHours} />
          <Stat label="Workouts"        value={stats.totalWorkouts} />
          <Stat label="Videos"          value={stats.videosPublished} />
        </section>

        {/* Active Streaks */}
        {profile.show.streaks && (
          <Section title="Active Streaks">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Streak label="Workout" icon="💪" days={stats.currentStreaks.workout} />
              <Streak label="Video"   icon="📹" days={stats.currentStreaks.video} />
              <Streak label="Journal" icon="✍️"  days={stats.currentStreaks.journal} />
              <Streak label="NF"      icon="🧘" days={stats.currentStreaks.nf} />
            </div>
          </Section>
        )}

        {/* Achievements */}
        {profile.show.achievements && (
          <Section title={`Achievements (${unlocked.length}/${ACHIEVEMENTS.length})`}>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {ACHIEVEMENTS.map(a => {
                const earned = unlocked.find(u => u.id === a.id);
                return (
                  <div
                    key={a.id}
                    title={`${a.name} — ${a.description}`}
                    className={`flex flex-col items-center gap-1 p-3 rounded-[14px] border text-center transition-all ${
                      earned
                        ? "bg-[rgba(255,255,255,0.04)] border-[rgba(29,155,240,0.28)] shadow-[0_0_18px_rgba(29,155,240,0.10)]"
                        : "bg-[rgba(255,255,255,0.02)] border-border-dim opacity-35 grayscale"
                    }`}
                  >
                    <span className="text-[22px] leading-none">{a.icon}</span>
                    <span className="text-[10px] font-600 text-text-2 line-clamp-1">{a.name}</span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Skills */}
        {profile.show.skills && profile.skills.length > 0 && (
          <Section title="Skills">
            <div className="flex flex-col gap-3">
              {profile.skills.map(s => (
                <div key={s.name} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-600 text-text-1">{s.name}</span>
                    <span className="text-[10px] font-600 text-text-3 font-mono">{s.level}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-[#a78bfa]"
                      style={{ width: `${Math.min(100, Math.max(0, s.level))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Quests */}
        {profile.show.quests && (
          <Section title="Quests Completed">
            <div className="glass p-5 flex items-center gap-4">
              <div className="text-[40px] leading-none">🥅</div>
              <div>
                <p className="text-[26px] font-700 leading-none">{stats.goalsAchieved}</p>
                <p className="text-[11px] text-text-3 mt-1">life goals achieved</p>
              </div>
            </div>
          </Section>
        )}

        {/* Battle log = top numbers strip */}
        {profile.show.battleLog && (
          <Section title="Battle Log">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat label="Top Video Views"     value={fmt(stats.topVideoViews)} />
              <Stat label="Long Form Posts"     value={stats.longFormCount} />
              <Stat label="Short Form Posts"    value={stats.shortFormCount} />
              <Stat label="Pillars Covered"     value={`${stats.pillarsCovered}/4`} />
              <Stat label="Best Day (Habits)"   value={`${stats.maxHabitsInOneDay}/4`} />
              <Stat label="Peak Hours / Day"    value={stats.peakHoursDay} />
            </div>
          </Section>
        )}

        <footer className="pt-6 pb-2 text-center">
          <p className="text-[10px] text-text-3 tracking-[0.18em] uppercase">
            Powered by <span className="text-accent">SpicerVisions OS</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass p-4 flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">{label}</p>
      <p className="text-[22px] font-700 leading-none text-text-1">{value}</p>
    </div>
  );
}

function Streak({ label, icon, days }: { label: string; icon: string; days: number }) {
  return (
    <div className="glass p-4 flex flex-col gap-1 items-start">
      <div className="flex items-center gap-1.5">
        <span className="text-[18px] leading-none">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-3">{label}</span>
      </div>
      <p className="text-[22px] font-700 leading-none text-text-1">
        {days}<span className="text-[12px] font-500 text-text-3 ml-1">d</span>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-3 font-600">{title}</h2>
      {children}
    </section>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
