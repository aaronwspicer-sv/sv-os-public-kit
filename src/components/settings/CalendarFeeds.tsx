"use client";
// Add/remove Google Calendar iCal feeds so Alfred can read your events.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Calendar, Plus, Trash2, ExternalLink } from "lucide-react";

interface Feed {
  id: string;
  label: string;
  color: string | null;
  created_at: string;
  preview: string;
}

export function CalendarFeeds() {
  const [feeds, setFeeds]   = useState<Feed[]>([]);
  const [count, setCount]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [label, setLabel]   = useState("");
  const [url, setUrl]       = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [ok, setOk]         = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/calendar/feeds");
    const d = await r.json();
    setFeeds(d.feeds ?? []);
    setCount(d.upcomingCount ?? 0);
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  async function add() {
    setErr(null); setOk(null);
    if (!label.trim() || !url.trim()) { setErr("Both fields required"); return; }
    setAdding(true);
    try {
      const r = await fetch("/api/calendar/feeds", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), url: url.trim() }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) { setErr(d.error ?? "Failed"); return; }
      setLabel(""); setUrl(""); setOk(`✓ Added "${label}"`);
      await refresh();
      setTimeout(() => setOk(null), 3000);
    } finally { setAdding(false); }
  }

  async function remove(id: string, lbl: string) {
    if (!confirm(`Remove "${lbl}"?`)) return;
    await fetch(`/api/calendar/feeds?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-[rgba(29,155,240,0.10)] border border-[rgba(29,155,240,0.22)] flex items-center justify-center flex-shrink-0">
          <Calendar size={18} className="text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Calendar feeds for Alfred</p>
          <p className="text-[11px] text-text-3 mt-0.5">
            Paste the secret iCal URL for each calendar you want Alfred to see. He'll use these for "what's on today", "is my morning free", etc.
          </p>
        </div>
      </div>

      {/* How-to */}
      <div className="text-[11px] text-text-2 p-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim leading-snug">
        <p className="font-600 text-text-1 mb-1">How to get a feed URL (per calendar):</p>
        <ol className="list-decimal pl-4 space-y-0.5">
          <li>Open <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="text-accent underline inline-flex items-center gap-1">Google Calendar <ExternalLink size={9} /></a></li>
          <li>Hover a calendar in the left sidebar → 3-dot menu → <b>Settings and sharing</b></li>
          <li>Scroll to <b>Integrate calendar</b></li>
          <li>Copy <b>Secret address in iCal format</b> (the one ending in <code>basic.ics</code>)</li>
          <li>Paste below with a friendly label like "Personal", "Hudson School", etc.</li>
        </ol>
        <p className="text-text-3 mt-1.5">URLs are encrypted at rest. Only the server fetches them.</p>
      </div>

      {/* Add */}
      <div className="flex flex-col gap-2">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Label (e.g. 'Personal', 'Hudson School', 'Holidays')"
          className="w-full px-3 py-2 text-[12px]"
          maxLength={60}
        />
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          className="w-full px-3 py-2 text-[12px] font-mono"
        />
        {err && <p className="text-[11px] text-danger">{err}</p>}
        {ok && <p className="text-[11px] text-success">{ok}</p>}
        <Button variant="primary" onClick={add} loading={adding} disabled={!label.trim() || !url.trim()}>
          <Plus size={13} /> Add calendar
        </Button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.14em] text-text-3 font-600">
          Connected ({feeds.length}) · {count} upcoming events
        </p>
        {loading && <p className="text-[11px] text-text-3 italic">Loading…</p>}
        {!loading && feeds.length === 0 && <p className="text-[11px] text-text-3 italic">No calendars yet. Alfred can't see your events until you add one.</p>}
        {feeds.map(f => (
          <div key={f.id} className="flex items-center gap-2 p-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
            <Calendar size={12} className="text-accent flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-600 text-text-1">{f.label}</p>
              <p className="text-[10px] text-text-3 font-mono truncate">{f.preview}</p>
            </div>
            <button onClick={() => remove(f.id, f.label)} className="text-text-3 hover:text-danger p-1">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
