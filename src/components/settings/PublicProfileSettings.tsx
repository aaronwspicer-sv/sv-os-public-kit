"use client";
// Editor for the user's /u/<slug> public profile.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Skill { name: string; level: number }

interface ProfileForm {
  slug: string;
  display_name: string;
  title: string;
  tagline: string;
  location: string;
  avatar_url: string;
  bio: string;
  skills: Skill[];
  show_streaks: boolean;
  show_achievements: boolean;
  show_quests: boolean;
  show_battle_log: boolean;
  show_skills: boolean;
}

const EMPTY: ProfileForm = {
  slug: "", display_name: "", title: "", tagline: "", location: "", avatar_url: "", bio: "",
  skills: [],
  show_streaks: true, show_achievements: true, show_quests: true,
  show_battle_log: true, show_skills: true,
};

export function PublicProfileSettings() {
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile").then(r => r.json()).then(d => {
      if (d.profile) {
        setForm({
          slug:              d.profile.slug ?? "",
          display_name:      d.profile.display_name ?? "",
          title:             d.profile.title ?? "",
          tagline:           d.profile.tagline ?? "",
          location:          d.profile.location ?? "",
          avatar_url:        d.profile.avatar_url ?? "",
          bio:               d.profile.bio ?? "",
          skills:            Array.isArray(d.profile.skills) ? d.profile.skills : [],
          show_streaks:      d.profile.show_streaks ?? true,
          show_achievements: d.profile.show_achievements ?? true,
          show_quests:       d.profile.show_quests ?? true,
          show_battle_log:   d.profile.show_battle_log ?? true,
          show_skills:       d.profile.show_skills ?? true,
        });
        setLiveSlug(d.profile.slug ?? null);
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  function set<K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function addSkill() {
    if (form.skills.length >= 12) return;
    set("skills", [...form.skills, { name: "", level: 50 }]);
  }
  function updateSkill(i: number, patch: Partial<Skill>) {
    set("skills", form.skills.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  }
  function removeSkill(i: number) {
    set("skills", form.skills.filter((_, idx) => idx !== i));
  }

  async function save() {
    setError(""); setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to save");
        return;
      }
      setLiveSlug(data.slug);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <Card><p className="text-text-3 text-[12px]">Loading…</p></Card>;
  }

  return (
    <Card className="flex flex-col gap-5">
      {/* Live link */}
      {liveSlug && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.22)]">
          <div className="flex flex-col">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-3">Live at</p>
            <p className="text-[13px] font-600 text-accent font-mono">/u/{liveSlug}</p>
          </div>
          <a
            href={`/u/${liveSlug}`}
            target="_blank" rel="noreferrer"
            className="text-[11px] font-600 text-accent underline"
          >
            Open ↗
          </a>
        </div>
      )}

      <Field label="Slug (URL)" hint="a–z, 0–9, _, -">
        <input value={form.slug} onChange={e => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          placeholder="aaron" className="w-full px-3 py-2 font-mono" maxLength={40} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Display name">
          <input value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="Aaron Spicer" className="w-full px-3 py-2" maxLength={80} />
        </Field>
        <Field label="Title">
          <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="Founder, Creator" className="w-full px-3 py-2" maxLength={80} />
        </Field>
      </div>

      <Field label="Tagline">
        <input value={form.tagline} onChange={e => set("tagline", e.target.value)} placeholder="Building in public, one log at a time" className="w-full px-3 py-2" maxLength={140} />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Location">
          <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Toronto, ON" className="w-full px-3 py-2" maxLength={80} />
        </Field>
        <Field label="Avatar URL" hint="https://…">
          <input value={form.avatar_url} onChange={e => set("avatar_url", e.target.value)} placeholder="https://…" className="w-full px-3 py-2 font-mono text-[12px]" />
        </Field>
      </div>

      <Field label="Bio" hint="Max 600 chars">
        <textarea value={form.bio} onChange={e => set("bio", e.target.value)} placeholder="The story so far…" rows={4} maxLength={600} className="w-full px-3 py-2 resize-y" />
      </Field>

      {/* Skills */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-600 text-text-2">Skills <span className="text-text-3 font-400">(max 12)</span></p>
          <button onClick={addSkill} className="text-[11px] font-600 text-accent" disabled={form.skills.length >= 12}>+ Add</button>
        </div>
        <div className="flex flex-col gap-2">
          {form.skills.map((s, i) => (
            <div key={i} className="flex items-center gap-2 p-2 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
              <input
                value={s.name}
                onChange={e => updateSkill(i, { name: e.target.value })}
                placeholder="Editing"
                className="flex-1 px-2 py-1 text-[12px] bg-transparent border border-border-dim rounded"
                maxLength={30}
              />
              <input
                type="range" min={0} max={100}
                value={s.level}
                onChange={e => updateSkill(i, { level: Number(e.target.value) })}
                className="w-32"
              />
              <span className="w-8 text-[11px] font-mono text-text-3 text-right">{s.level}</span>
              <button onClick={() => removeSkill(i)} className="text-[11px] text-danger px-2">✕</button>
            </div>
          ))}
          {form.skills.length === 0 && (
            <p className="text-[11px] text-text-3 italic">No skills added yet.</p>
          )}
        </div>
      </div>

      {/* Visibility toggles */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border-dim">
        <p className="text-[12px] font-600 text-text-2">Show on public profile</p>
        {([
          ["show_streaks",      "Active Streaks"],
          ["show_achievements", "Achievements"],
          ["show_quests",       "Quests Completed"],
          ["show_battle_log",   "Battle Log (top numbers)"],
          ["show_skills",       "Skills Bars"],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between py-1.5">
            <span className="text-[12px] text-text-1">{label}</span>
            <input
              type="checkbox"
              checked={form[key]}
              onChange={e => set(key, e.target.checked)}
              className="w-4 h-4"
            />
          </label>
        ))}
      </div>

      {error && <p className="text-[12px] text-danger">{error}</p>}
      <Button variant="primary" onClick={save} loading={saving} className="w-full">
        {saved ? "✓ Saved" : "Save Profile"}
      </Button>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[12px] font-600 text-text-2">{label}</label>
        {hint && <span className="text-[10px] text-text-3">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
