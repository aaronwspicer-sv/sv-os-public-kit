"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { DEMO_VIDEOS, DEMO_IDEAS } from "@/lib/demoMode";
import { type Pillar, PILLARS, PILLAR_COLOR, normalizePillar } from "@/lib/pillars";
import {
  Plus, Music2, Eye, Calendar as CalendarIcon, TrendingUp, Sparkles,
  Image as ImageIcon, ExternalLink, AlertTriangle, ChevronRight,
  Film, Smartphone, Activity, BarChart3, Layers, Inbox, Trash2, ArrowUpRight,
  Zap, RefreshCw, Rocket, Check, Circle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { config } from "@/config";

// ── Types ──────────────────────────────────────────────────────
type Status  = "Idea" | "Packaged" | "Scripted" | "Filmed" | "Editing" | "Live";
type VidType = "Long Form" | "Short Form Clip" | "Standalone Short";
type Effort  = "High" | "Medium" | "Low";

interface Video {
  id: string;
  notionUrl: string | null;
  title: string;
  status: string;
  type: string;
  pillar: string;
  platform: string[];
  effortLevel: string;
  publishDate: string | null;
  views: number;
  thumbnail: string | null;
  finalVideo: string | null;
  slug: string | null;
  notes: string;
  parentVideoId: string | null;
  shortFormClipIds: string[];
  viralInspirationId: string | null;
  lastEdited: string | null;
  createdTime: string | null;
}

const STATUSES: Status[]  = ["Idea", "Packaged", "Scripted", "Filmed", "Editing", "Live"];
const ACTIVE_STATUSES = STATUSES.filter(s => s !== "Live");
const TYPES: VidType[]    = ["Long Form", "Short Form Clip", "Standalone Short"];
const EFFORTS: Effort[]   = ["Low", "Medium", "High"];
const STATUS_COLOR: Record<string, string> = {
  Idea: "#94a3b8", Packaged: "#a78bfa", Scripted: "#1D9BF0",
  Filmed: "#fbbf24", Editing: "#f97316", Live: "#34d399",
};
const EFFORT_VARIANT: Record<string, "danger"|"warning"|"success"> = {
  High: "danger", Medium: "warning", Low: "success",
};

const STAGE_AGE_WARN = 7;   // days
const STAGE_AGE_BAD  = 14;  // days

function daysSince(iso?: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000*60*60*24));
}
function fmtViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// ── Platform icons ─────────────────────────────────────────────
function YTIcon()      { return <svg width="11" height="11" viewBox="0 0 24 24" fill="#ff4444"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5v-7l6.25 3.5-6.25 3.5z"/></svg>; }
function IGIcon()      { return <svg width="11" height="11" viewBox="0 0 24 24" fill="#e1306c"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.31.975.975 1.247 2.242 1.31 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.334 2.633-1.31 3.608-.975.975-2.242 1.247-3.608 1.31-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.334-3.608-1.31-.975-.975-1.247-2.242-1.31-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.334-2.633 1.31-3.608.975-.975 2.242-1.247 3.608-1.31C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.635 2.014 1.977.635 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.563 3.697 1.942 5.076C3.355 23.365 5.197 23.843 7.052 23.928 8.332 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 1.855-.085 3.697-.563 5.076-1.942 1.379-1.379 1.857-3.221 1.942-5.076C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.668-.072-4.948-.085-1.855-.563-3.697-1.942-5.076C20.645.635 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>; }
function PlatformIcon({ p }: { p: string }) {
  if (p === "YouTube" || p === "YT Shorts") return <YTIcon />;
  if (p === "IG Reels") return <IGIcon />;
  if (p === "TikTok")   return <Music2 size={11} className="text-text-2" />;
  return null;
}

// ── Main page ─────────────────────────────────────────────────
export default function ContentPage() {
  const toast = useToast();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [tab, setTab]       = useState<"overview"|"pipeline"|"inbox"|"calendar"|"performance"|"channel">("overview");
  const [filterPillar, setFilterPillar] = useState<Pillar | "All">("All");
  const [filterType, setFilterType]     = useState<"All" | "Long Form" | "Short">("All");

  // Quick-capture state
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureTitle, setCaptureTitle] = useState("");
  const [capturePillar, setCapturePillar] = useState<Pillar>("Building AI Systems");
  const [captureType, setCaptureType] = useState<VidType>("Long Form");
  const [captureBusy, setCaptureBusy] = useState(false);

  const { isDemoMode } = useDemoMode();
  const load = useCallback(async () => {
    if (isDemoMode) { setVideos(DEMO_VIDEOS as any); return; }
    try {
      const r = await fetch("/api/notion/videos");
      const d = await r.json();
      if (d.videos) setVideos((d.videos as Video[]).map(v => ({ ...v, pillar: normalizePillar(v.pillar) })));
      else if (d.error) toast.error("Couldn't load videos", d.error);
    } catch (e: any) {
      toast.error("Network error", e?.message);
    }
  }, [toast, isDemoMode]);

  useEffect(() => { load(); }, [load]);

  async function createIdea() {
    if (!captureTitle.trim()) return;
    setCaptureBusy(true);
    try {
      const r = await fetch("/api/notion/videos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: captureTitle,
          pillar: capturePillar,
          type: captureType,
        }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
      toast.success("Idea added", captureTitle);
      setCaptureTitle("");
      setCaptureOpen(false);
      load();
    } catch (e: any) {
      toast.error("Couldn't add idea", e?.message);
    } finally {
      setCaptureBusy(false);
    }
  }

  async function updateVideo(pageId: string, patch: Record<string, any>) {
    // Optimistic update
    setVideos(prev => prev?.map(v => v.id === pageId ? { ...v, ...patch } : v) ?? null);
    try {
      const r = await fetch("/api/notion/videos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, ...patch }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
    } catch (e: any) {
      toast.error("Update failed", e?.message);
      load(); // re-sync on error
    }
  }

  // Filtered set for Pipeline tab
  const filtered = useMemo(() => {
    if (!videos) return [];
    return videos.filter(v => {
      if (filterPillar !== "All" && v.pillar !== filterPillar) return false;
      if (filterType === "Long Form" && v.type !== "Long Form") return false;
      if (filterType === "Short" && v.type === "Long Form") return false;
      return true;
    });
  }, [videos, filterPillar, filterType]);

  const tabs = [
    { key: "overview",    label: "Overview",    icon: Activity },
    { key: "pipeline",    label: "Pipeline",    icon: Layers },
    { key: "inbox",       label: "Inbox",       icon: Inbox },
    { key: "calendar",    label: "Calendar",    icon: CalendarIcon },
    { key: "performance", label: "Performance", icon: BarChart3 },
    { key: "channel",     label: "Channel",     icon: Zap },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="animate-fade-up stagger-1 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-text-3 text-[11px] uppercase tracking-[0.18em] mb-1">Content Pipeline</p>
          <h1 className="text-[24px] font-700 tracking-tight">SV Videos</h1>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCaptureOpen(true)}>
          <Plus size={14} /> New Idea
        </Button>
      </div>

      {/* Quick-capture modal */}
      {captureOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 bg-black/60 backdrop-blur-md animate-fade-in"
             onClick={(e) => { if (e.target === e.currentTarget) setCaptureOpen(false); }}>
          <div className="glass-3 w-full max-w-[440px] rounded-[20px] p-5 flex flex-col gap-4"
               style={{ animation: "scale-in 0.24s var(--ease-spring) both" }}>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" />
              <h2 className="text-[15px] font-700 text-text-1">New video idea</h2>
            </div>
            <input
              autoFocus
              value={captureTitle}
              onChange={(e) => setCaptureTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createIdea(); if (e.key === "Escape") setCaptureOpen(false); }}
              placeholder="Why I built this at 17…"
              className="px-3 py-2.5 text-[14px]"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">Pillar</label>
                <select value={capturePillar} onChange={(e) => setCapturePillar(e.target.value as Pillar)} className="w-full px-3 py-2 text-[12px]">
                  {PILLARS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1.5 block">Type</label>
                <select value={captureType} onChange={(e) => setCaptureType(e.target.value as VidType)} className="w-full px-3 py-2 text-[12px]">
                  {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCaptureOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={createIdea} loading={captureBusy} disabled={!captureTitle.trim()}>
                <Plus size={12} /> Create Idea
              </Button>
            </div>
            <p className="text-[10px] text-text-3 text-center">
              Status: Idea · Picked up by <code className="text-accent">/sv-pipeline</code> in Claude Code next time you open it
            </p>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="animate-fade-up stagger-2 flex gap-1 p-1 bg-surface-2 rounded-[12px]">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] text-[12px] font-600 transition-all ${
                tab === t.key ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
              }`}
            >
              <Icon size={12} />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && <OverviewTab videos={videos} updateVideo={updateVideo} onJump={(t) => setTab(t)} onNewIdea={() => setCaptureOpen(true)} />}

      {/* ── PIPELINE ── */}
      {tab === "pipeline" && (
        <PipelineTab
          videos={filtered}
          loading={!videos}
          filterPillar={filterPillar} setFilterPillar={setFilterPillar}
          filterType={filterType}     setFilterType={setFilterType}
          updateVideo={updateVideo}
        />
      )}

      {/* ── CALENDAR ── */}
      {tab === "calendar" && <CalendarTab videos={videos} updateVideo={updateVideo} />}

      {/* ── PERFORMANCE ── */}
      {tab === "performance" && <PerformanceTab videos={videos} updateVideo={updateVideo} />}

      {/* ── INBOX ── */}
      {tab === "inbox" && <InboxTab onPromoted={() => load()} />}

      {/* ── COMMAND ── */}
      {tab === "channel" && <CommandTab videos={videos} onSynced={load} />}
    </div>
  );
}

// ── OVERVIEW TAB ──────────────────────────────────────────────
function OverviewTab({
  videos, updateVideo, onJump, onNewIdea,
}: {
  videos: Video[] | null;
  updateVideo: (id: string, patch: Record<string, any>) => void;
  onJump: (t: "pipeline"|"calendar"|"performance") => void;
  onNewIdea: () => void;
}) {
  if (!videos) {
    return <Card><SkeletonRows count={4} /></Card>;
  }

  const live = videos.filter(v => v.status === "Live");
  const active = videos.filter(v => v.status !== "Live");
  const lastPublished = live
    .filter(v => v.publishDate)
    .sort((a, b) => (b.publishDate ?? "").localeCompare(a.publishDate ?? ""))[0]
    ?? live[0]
    ?? null;
  const topPerformers = [...live].sort((a, b) => b.views - a.views).slice(0, 3);

  // This week's upcoming publishes (next 7 days)
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = videos
    .filter(v => v.publishDate && new Date(v.publishDate) >= now && new Date(v.publishDate) <= sevenDays && v.status !== "Live")
    .sort((a, b) => (a.publishDate ?? "").localeCompare(b.publishDate ?? ""));

  // Stuck videos (in same stage > 14 days)
  const stuck = active
    .map(v => ({ v, age: daysSince(v.lastEdited) }))
    .filter(x => x.age >= STAGE_AGE_BAD)
    .sort((a, b) => b.age - a.age)
    .slice(0, 3);

  // Stage counts
  const stageCounts = ACTIVE_STATUSES.map(s => ({
    status: s, count: active.filter(v => v.status === s).length,
  }));

  return (
    <div className="flex flex-col gap-4 animate-fade-up stagger-3">

      {/* Stage strip — at-a-glance pipeline volume */}
      <Card>
        <CardHeader>
          <CardTitle>In flight</CardTitle>
          <button onClick={() => onJump("pipeline")} className="text-[11px] text-text-3 hover:text-accent transition-colors inline-flex items-center gap-1">
            View pipeline <ChevronRight size={11} />
          </button>
        </CardHeader>
        <div className="grid grid-cols-5 gap-2">
          {stageCounts.map(({ status, count }) => (
            <div key={status} className="flex flex-col items-center gap-1 px-2 py-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <p className="text-[20px] font-700 tabular-nums text-text-1">{count}</p>
              <p className="text-[9px] uppercase tracking-widest text-text-3">{status}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Stuck warning */}
      {stuck.length > 0 && (
        <Card variant="warning">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-warning" />
              <CardTitle>Stuck {stuck.length === 1 ? "video" : "videos"}</CardTitle>
            </div>
            <Badge variant="warning">{stuck.length}</Badge>
          </CardHeader>
          <div className="flex flex-col gap-2">
            {stuck.map(({ v, age }) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[v.status] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1 truncate">{v.title}</p>
                  <p className="text-[11px] text-text-3">{v.status} · <span className="text-warning">{age}d in stage</span></p>
                </div>
                {v.notionUrl && (
                  <a href={v.notionUrl} target="_blank" rel="noopener noreferrer" className="text-text-3 hover:text-accent">
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Going live this week */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarIcon size={14} className="text-accent" />
            <CardTitle>Going live this week</CardTitle>
          </div>
          <button onClick={() => onJump("calendar")} className="text-[11px] text-text-3 hover:text-accent transition-colors inline-flex items-center gap-1">
            Calendar <ChevronRight size={11} />
          </button>
        </CardHeader>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing scheduled" body="Set a publish date in the Calendar view." size="sm" />
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map(v => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <div className="w-[42px] flex flex-col items-center flex-shrink-0">
                  <p className="text-[10px] uppercase text-text-3 tracking-wider">{new Date(v.publishDate!).toLocaleDateString("en-CA", { month: "short", timeZone: config.locale.timezone })}</p>
                  <p className="text-[18px] font-700 tabular-nums text-text-1 -mt-1">{new Date(v.publishDate!).getDate()}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1 truncate">{v.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-700" style={{ color: PILLAR_COLOR[v.pillar] }}>{v.pillar}</span>
                    <span className="text-text-3 text-[10px]">·</span>
                    <span className="text-[10px] text-text-3">{v.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">{v.platform.map(p => <PlatformIcon key={p} p={p} />)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Last published — quick views update */}
      {lastPublished && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-success" />
              <CardTitle>Last published</CardTitle>
            </div>
            {lastPublished.publishDate && <span className="text-[11px] text-text-3">{formatDate(lastPublished.publishDate)}</span>}
          </CardHeader>
          <div className="flex items-center gap-3">
            <Thumb src={lastPublished.thumbnail} size={56} />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-600 text-text-1 truncate">{lastPublished.title}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-700" style={{ color: PILLAR_COLOR[lastPublished.pillar] }}>{lastPublished.pillar}</span>
                <span className="text-text-3 text-[10px]">·</span>
                <span className="text-[10px] text-text-3">{lastPublished.type}</span>
              </div>
              <ViewsInput
                value={lastPublished.views}
                onSave={(n) => updateVideo(lastPublished.id, { views: n })}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Top performers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp size={14} className="text-success" />
            <CardTitle>Top performers</CardTitle>
          </div>
          <button onClick={() => onJump("performance")} className="text-[11px] text-text-3 hover:text-accent transition-colors inline-flex items-center gap-1">
            All performance <ChevronRight size={11} />
          </button>
        </CardHeader>
        {topPerformers.length === 0 ? (
          <EmptyState title="No published videos yet" size="sm" />
        ) : (
          <div className="flex flex-col gap-2">
            {topPerformers.map((v, i) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <p className="text-[14px] font-700 text-text-3 w-4">{i + 1}</p>
                <Thumb src={v.thumbnail} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1 truncate">{v.title}</p>
                  <span className="text-[10px] font-700" style={{ color: PILLAR_COLOR[v.pillar] }}>{v.pillar}</span>
                </div>
                <div className="flex items-center gap-1 text-right">
                  <Eye size={11} className="text-text-3" />
                  <span className="text-[13px] font-700 tabular-nums font-mono text-text-1">{fmtViews(v.views)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick capture footer */}
      <Card interactive onClick={onNewIdea} className="!p-0 cursor-pointer">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-9 h-9 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.25)] flex items-center justify-center">
            <Plus size={14} className="text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-600 text-text-1">Quick capture</p>
            <p className="text-[11px] text-text-3">Drop an idea — Claude Code picks it up</p>
          </div>
          <ChevronRight size={14} className="text-text-3" />
        </div>
      </Card>
    </div>
  );
}

// Inline editable views field
function ViewsInput({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n !== value) onSave(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5">
        <Eye size={11} className="text-text-3" />
        <input
          autoFocus
          type="number" inputMode="numeric"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
          className="px-2 py-0.5 text-[12px] w-[100px]"
        />
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 mt-1.5 text-[12px] text-text-2 hover:text-accent transition-colors">
      <Eye size={11} />
      <span className="font-700 tabular-nums">{fmtViews(value)} views</span>
      <span className="text-[10px] text-text-3">· tap to edit</span>
    </button>
  );
}

// Thumbnail with iCloud-aware fallback
function Thumb({ src, size = 48 }: { src: string | null; size?: number }) {
  // iCloud URLs aren't publicly fetchable — show a placeholder for those + link out
  const isIcloud = src?.includes("icloud") || src?.startsWith("file://");
  if (!src || isIcloud) {
    return (
      <div
        className="flex-shrink-0 rounded-[8px] bg-[rgba(29,155,240,0.05)] border border-border-dim flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <ImageIcon size={size * 0.35} className="text-text-3" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="flex-shrink-0 rounded-[8px] object-cover bg-[rgba(255,255,255,0.03)]" style={{ width: size, height: size }} />;
}

// ── PIPELINE TAB (kanban with thumbnails + age) ───────────────
function PipelineTab({
  videos, loading, filterPillar, setFilterPillar, filterType, setFilterType, updateVideo,
}: {
  videos: Video[];
  loading: boolean;
  filterPillar: Pillar | "All";
  setFilterPillar: (p: Pillar | "All") => void;
  filterType: "All" | "Long Form" | "Short";
  setFilterType: (t: "All" | "Long Form" | "Short") => void;
  updateVideo: (id: string, patch: Record<string, any>) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);

  function onDrop(status: Status) {
    if (!dragging) return;
    const v = videos.find(x => x.id === dragging);
    if (v && v.status !== status) updateVideo(dragging, { status });
    setDragging(null);
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-up stagger-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex gap-1.5">
          {(["All", ...PILLARS] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPillar(p)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-600 uppercase tracking-wide transition-all border ${
                filterPillar === p ? "bg-accent-dim border-[rgba(29,155,240,0.3)] text-accent" : "border-border-dim text-text-3 hover:border-border hover:text-text-2"
              }`}
            >{p}</button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-surface-2 rounded-[10px] ml-auto">
          {(["All", "Long Form", "Short"] as const).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-[8px] text-[11px] font-600 transition-all inline-flex items-center gap-1 ${
                filterType === t ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
              }`}
            >
              {t === "Long Form" && <Film size={10} />}
              {t === "Short" && <Smartphone size={10} />}
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        {loading ? (
          <div className="flex gap-3 min-w-max">
            {STATUSES.map(s => <Skeleton key={s} width={220} height={280} rounded="lg" />)}
          </div>
        ) : (
          <div className="flex gap-3 min-w-max">
            {STATUSES.map(col => {
              const colVideos = videos.filter(v => v.status === col);
              return (
                <div
                  key={col}
                  className="w-[220px] flex flex-col gap-2"
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(col)}
                >
                  <div className="flex items-center justify-between px-1 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[col] }} />
                      <span className="text-[10px] font-700 uppercase tracking-[0.18em] text-text-3">{col}</span>
                    </div>
                    <span className="text-[10px] text-text-3 tabular-nums font-mono">{colVideos.length}</span>
                  </div>
                  <div className="flex flex-col gap-2 min-h-[80px]">
                    {colVideos.map(v => {
                      const age = daysSince(v.lastEdited);
                      const ageWarning = col !== "Live" && (age >= STAGE_AGE_BAD ? "bad" : age >= STAGE_AGE_WARN ? "warn" : null);
                      return (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => setDragging(v.id)}
                          onDragEnd={() => setDragging(null)}
                          className="glass-1 rounded-[12px] p-2.5 cursor-grab active:cursor-grabbing hover:border-[rgba(29,155,240,0.28)] transition-all flex flex-col gap-2"
                        >
                          {/* Top: thumbnail + title */}
                          <div className="flex gap-2">
                            <Thumb src={v.thumbnail} size={40} />
                            <p className="text-[12px] font-600 text-text-1 leading-tight line-clamp-3 flex-1">{v.title}</p>
                          </div>
                          {/* Pillar + effort */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-700" style={{ color: PILLAR_COLOR[v.pillar] }}>{v.pillar}</span>
                            <span className="text-text-3 text-[10px]">·</span>
                            <Badge variant={EFFORT_VARIANT[v.effortLevel] ?? "muted"} className="!text-[9px] !px-1.5 !py-0">
                              {v.effortLevel}
                            </Badge>
                            {ageWarning && (
                              <span className={`text-[9px] font-700 ml-auto ${ageWarning === "bad" ? "text-danger" : "text-warning"}`}>
                                {age}d
                              </span>
                            )}
                          </div>
                          {/* Bottom: platforms + type + publish date */}
                          <div className="flex items-center gap-1.5">
                            {v.platform.map(p => <PlatformIcon key={p} p={p} />)}
                            {v.publishDate && (
                              <span className="text-[9px] text-accent ml-auto inline-flex items-center gap-0.5">
                                <CalendarIcon size={8} /> {new Date(v.publishDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: config.locale.timezone })}
                              </span>
                            )}
                            {!v.publishDate && <span className="text-[9px] text-text-3 ml-auto">{v.type === "Long Form" ? "LF" : v.type === "Short Form Clip" ? "Clip" : "Short"}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {dragging && !colVideos.find(v => v.id === dragging) && (
                      <div className="border border-dashed border-[rgba(29,155,240,0.3)] rounded-[12px] h-14 flex items-center justify-center">
                        <span className="text-[11px] text-accent">Drop here</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CALENDAR TAB ──────────────────────────────────────────────
function CalendarTab({ videos, updateVideo }: { videos: Video[] | null; updateVideo: (id: string, patch: Record<string, any>) => void }) {
  const [monthOffset, setMonthOffset] = useState(0); // 0 = this month
  const base = new Date();
  const cursor = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = cursor.toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  // Build calendar grid (start from Monday for our app convention)
  const startCol = (firstDay + 6) % 7; // shift so Mon=0
  const cells: Array<{ day: number | null }> = [];
  for (let i = 0; i < startCol; i++) cells.push({ day: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push({ day: null });

  function videosForDay(d: number): Video[] {
    if (!videos) return [];
    const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    return videos.filter(v => v.publishDate?.startsWith(dateStr));
  }

  if (!videos) return <Card><Skeleton width="100%" height={400} /></Card>;

  return (
    <div className="flex flex-col gap-3 animate-fade-up stagger-3">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              className="w-7 h-7 rounded-[8px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all"
            >‹</button>
            <CardTitle>{monthLabel}</CardTitle>
            <button
              onClick={() => setMonthOffset(o => o + 1)}
              className="w-7 h-7 rounded-[8px] glass-1 inline-flex items-center justify-center hover:border-accent text-text-2 hover:text-accent transition-all"
            >›</button>
          </div>
          <button
            onClick={() => setMonthOffset(0)}
            className="text-[11px] text-text-3 hover:text-accent transition-colors"
          >Today</button>
        </CardHeader>

        <div className="grid grid-cols-7 gap-1 mb-1.5">
          {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
            <div key={d} className="text-[10px] uppercase tracking-widest text-text-3 text-center py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (c.day == null) return <div key={i} className="aspect-square" />;
            const vs = videosForDay(c.day);
            const isToday = c.day === base.getDate() && month === base.getMonth() && year === base.getFullYear();
            return (
              <div
                key={i}
                className={`relative aspect-square rounded-[8px] p-1 flex flex-col gap-0.5 ${
                  isToday ? "bg-[rgba(29,155,240,0.10)] border border-[rgba(29,155,240,0.32)]" : "bg-[rgba(255,255,255,0.02)] border border-border-dim hover:border-border"
                }`}
              >
                <p className={`text-[10px] tabular-nums ${isToday ? "text-accent font-700" : "text-text-3"}`}>{c.day}</p>
                {vs.slice(0, 3).map(v => (
                  <a
                    key={v.id}
                    href={v.notionUrl ?? "#"}
                    target="_blank" rel="noopener noreferrer"
                    title={v.title}
                    className="text-[9px] font-600 truncate px-1 py-0.5 rounded-[4px] hover:brightness-125"
                    style={{ background: `${PILLAR_COLOR[v.pillar]}24`, color: PILLAR_COLOR[v.pillar] }}
                  >
                    {v.title}
                  </a>
                ))}
                {vs.length > 3 && (
                  <p className="text-[9px] text-text-3 px-1">+{vs.length - 3}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Unscheduled with status != Live — let user assign dates */}
      <Card>
        <CardHeader>
          <CardTitle>Unscheduled · Not Live</CardTitle>
          <Badge variant="muted">{videos.filter(v => !v.publishDate && v.status !== "Live").length}</Badge>
        </CardHeader>
        {videos.filter(v => !v.publishDate && v.status !== "Live").length === 0 ? (
          <EmptyState title="Everything is scheduled" size="sm" />
        ) : (
          <div className="flex flex-col gap-2">
            {videos.filter(v => !v.publishDate && v.status !== "Live").slice(0, 8).map(v => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[v.status] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-600 text-text-1 truncate">{v.title}</p>
                  <p className="text-[10px] text-text-3">{v.status} · {v.pillar}</p>
                </div>
                <input
                  type="date"
                  onChange={(e) => { if (e.target.value) updateVideo(v.id, { publishDate: e.target.value }); }}
                  className="px-2 py-1 text-[11px]"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── PERFORMANCE TAB ───────────────────────────────────────────
function PerformanceTab({ videos, updateVideo }: { videos: Video[] | null; updateVideo: (id: string, patch: Record<string, any>) => void }) {
  const [sortKey, setSortKey] = useState<"views"|"date"|"title">("views");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  if (!videos) return <Card><SkeletonRows count={5} /></Card>;

  const live = videos.filter(v => v.status === "Live");
  if (live.length === 0) {
    return <Card><EmptyState title="No published videos yet" body="Once a video flips to Live, performance data shows here." /></Card>;
  }

  const sorted = [...live].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "views") return (a.views - b.views) * dir;
    if (sortKey === "title") return a.title.localeCompare(b.title) * dir;
    return (a.publishDate ?? "").localeCompare(b.publishDate ?? "") * dir;
  });

  const totalViews = live.reduce((s, v) => s + v.views, 0);
  const avgViews = Math.round(totalViews / Math.max(1, live.length));
  const byPillar = PILLARS.map(p => ({
    pillar: p,
    count: live.filter(v => v.pillar === p).length,
    views: live.filter(v => v.pillar === p).reduce((s, v) => s + v.views, 0),
  }));

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }
  function SortHead({ k, label }: { k: typeof sortKey; label: string }) {
    const active = sortKey === k;
    return (
      <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-0.5 ${active ? "text-accent" : "text-text-3 hover:text-text-2"} transition-colors`}>
        {label} {active && (sortDir === "desc" ? "↓" : "↑")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 animate-fade-up stagger-3">
      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">Total Views</p>
          <p className="text-[22px] font-700 tabular-nums font-mono text-text-1">{fmtViews(totalViews)}</p>
          <p className="text-[10px] text-text-3 mt-0.5">across {live.length} {live.length === 1 ? "video" : "videos"}</p>
        </Card>
        <Card>
          <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">Average</p>
          <p className="text-[22px] font-700 tabular-nums font-mono text-text-1">{fmtViews(avgViews)}</p>
          <p className="text-[10px] text-text-3 mt-0.5">per video</p>
        </Card>
        <Card>
          <p className="text-[10px] uppercase tracking-widest text-text-3 mb-1">Top Pillar</p>
          {(() => {
            const top = [...byPillar].sort((a,b) => b.views - a.views)[0];
            return (
              <>
                <p className="text-[18px] font-700" style={{ color: PILLAR_COLOR[top.pillar] }}>{top.pillar}</p>
                <p className="text-[10px] text-text-3 mt-0.5">{fmtViews(top.views)} views</p>
              </>
            );
          })()}
        </Card>
      </div>

      {/* Pillar breakdown bar */}
      <Card>
        <CardHeader><CardTitle>By Pillar</CardTitle></CardHeader>
        <div className="flex h-2 rounded-full overflow-hidden bg-[rgba(255,255,255,0.04)]">
          {byPillar.map(p => {
            const pct = totalViews > 0 ? (p.views / totalViews) * 100 : 0;
            if (pct === 0) return null;
            return <div key={p.pillar} style={{ width: `${pct}%`, background: PILLAR_COLOR[p.pillar], boxShadow: `0 0 6px ${PILLAR_COLOR[p.pillar]}80` }} />;
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {byPillar.map(p => (
            <div key={p.pillar} className="flex items-center gap-1.5 text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: PILLAR_COLOR[p.pillar] }} />
              <span className="text-text-2">{p.pillar}</span>
              <span className="text-text-1 font-700 tabular-nums">{fmtViews(p.views)}</span>
              <span className="text-text-3">· {p.count}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Published</CardTitle>
          <Badge variant="muted">{live.length}</Badge>
        </CardHeader>
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-1 text-[10px] uppercase tracking-widest">
            <SortHead k="title" label="Title" />
            <span className="text-right"><SortHead k="views" label="Views" /></span>
            <span className="text-right"><SortHead k="date" label="Date" /></span>
            <span className="text-right">Edit</span>
          </div>
          {sorted.map(v => (
            <div key={v.id} className="grid grid-cols-[1fr_80px_80px_60px] gap-2 px-3 py-2 rounded-[8px] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] items-center">
              <div className="min-w-0 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PILLAR_COLOR[v.pillar] }} />
                <span className="text-[12px] font-600 text-text-1 truncate">{v.title}</span>
              </div>
              <span className="text-right text-[12px] font-700 tabular-nums font-mono text-text-1">{fmtViews(v.views)}</span>
              <span className="text-right text-[11px] text-text-3 tabular-nums">{v.publishDate ? formatDate(v.publishDate) : "—"}</span>
              <div className="flex items-center gap-1 justify-end">
                <PerfViewsEdit value={v.views} onSave={(n) => updateVideo(v.id, { views: n })} />
                {v.notionUrl && <a href={v.notionUrl} target="_blank" rel="noopener noreferrer" className="text-text-3 hover:text-accent"><ExternalLink size={11} /></a>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PerfViewsEdit({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  if (open) {
    return (
      <input
        autoFocus type="number" inputMode="numeric"
        value={v}
        onChange={e => setV(e.target.value)}
        onBlur={() => { const n = parseInt(v, 10); if (!isNaN(n) && n !== value) onSave(n); setOpen(false); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(String(value)); setOpen(false); } }}
        className="px-1.5 py-0.5 text-[11px] w-[60px]"
      />
    );
  }
  return (
    <button onClick={() => setOpen(true)} className="text-text-3 hover:text-accent transition-colors" title="Update views">
      <Eye size={11} />
    </button>
  );
}

// ── COMMAND TAB ───────────────────────────────────────────────
interface ChannelStats {
  subs: number;
  totalViews: number;
  videos: number;
  title: string;
}

function CommandTab({ videos, onSynced }: { videos: Video[] | null; onSynced: () => void }) {
  const toast = useToast();
  const [channel, setChannel] = useState<ChannelStats | null>(null);
  const [channelErr, setChannelErr] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/youtube/channel")
      .then(r => r.json())
      .then(d => { if (d.error) setChannelErr(true); else setChannel(d); })
      .catch(() => setChannelErr(true));
  }, []);

  async function syncViews() {
    setSyncing(true);
    try {
      const r = await fetch("/api/cron/sync-views", { method: "POST" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Sync failed");
      if (d.updated > 0) {
        toast.success("Views synced", `${d.updated} of ${d.checked} updated from YouTube`);
        onSynced();
      } else {
        toast.success("Views up to date", `${d.checked} Live ${d.checked === 1 ? "video" : "videos"} checked`);
      }
    } catch (e: any) {
      toast.error("Sync failed", e?.message);
    } finally {
      setSyncing(false);
    }
  }

  function copyPrompt(id: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  if (!videos) return <Card><SkeletonRows count={6} /></Card>;

  const live   = videos.filter(v => v.status === "Live");
  const active = videos.filter(v => v.status !== "Live");

  const stuck = active
    .map(v => ({ v, age: daysSince(v.lastEdited) }))
    .filter(x => x.age >= STAGE_AGE_BAD)
    .sort((a, b) => b.age - a.age);

  const needsRepurpose = live.filter(
    v => v.type === "Long Form" && v.shortFormClipIds.length === 0,
  );

  const staleViews = live
    .filter(v => {
      const publishedAgo = v.publishDate ? daysSince(v.publishDate) : 0;
      return publishedAgo >= 7 && (v.views === 0 || daysSince(v.lastEdited) >= 7);
    })
    .sort((a, b) => daysSince(b.publishDate) - daysSince(a.publishDate))
    .slice(0, 5);

  const velocity = ACTIVE_STATUSES.map(s => {
    const vids = active.filter(v => v.status === s);
    const avgDays = vids.length > 0
      ? Math.round(vids.reduce((sum, v) => sum + daysSince(v.lastEdited), 0) / vids.length)
      : null;
    return { status: s, count: vids.length, avgDays };
  });

  // Publish-readiness gate: videos in the final (Editing) stage, with a
  // per-asset checklist. "Ready" = all four assets locked. No auto-upload —
  // Aaron publishes from YouTube Studio; this just tells him what's ready.
  const editing = active
    .filter(v => v.status === "Editing")
    .map(v => {
      const checks = [
        { label: "Title",     ok: !!v.title },
        { label: "Thumbnail", ok: !!v.thumbnail },
        { label: "Video",     ok: !!v.finalVideo },
        { label: "Date",      ok: !!v.publishDate },
      ];
      return { v, checks, ready: checks.every(c => c.ok) };
    });
  const readyCount = editing.filter(e => e.ready).length;

  const totalAttention = stuck.length + needsRepurpose.length + staleViews.length;

  return (
    <div className="flex flex-col gap-4 animate-fade-up stagger-3">

      {/* Channel Health */}
      <Card>
        <CardHeader>
          <CardTitle>Channel Health</CardTitle>
          <div className="flex items-center gap-3">
            <button
              onClick={syncViews}
              disabled={syncing}
              className="text-[11px] text-text-3 hover:text-accent transition-colors inline-flex items-center gap-1 disabled:opacity-50"
              title="Pull live view counts from YouTube into Notion"
            >
              <RefreshCw size={10} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync views"}
            </button>
            <a
              href="https://studio.youtube.com"
              target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-text-3 hover:text-accent transition-colors inline-flex items-center gap-1"
            >
              Studio <ExternalLink size={10} />
            </a>
          </div>
        </CardHeader>
        {!channel && !channelErr ? (
          <div className="grid grid-cols-3 gap-3">
            {[0,1,2].map(i => <Skeleton key={i} width="100%" height={56} rounded="md" />)}
          </div>
        ) : channelErr ? (
          <p className="text-[12px] text-text-3 py-1">
            YOUTUBE_API_KEY not configured or quota exceeded.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {([
              { label: "Subscribers", value: fmtViews(channel!.subs) },
              { label: "Total Views",  value: fmtViews(channel!.totalViews) },
              { label: "Videos",       value: String(channel!.videos) },
            ] as const).map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
                <p className="text-[10px] uppercase tracking-widest text-text-3">{label}</p>
                <p className="text-[22px] font-700 tabular-nums font-mono text-text-1">{value}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Publish Readiness */}
      {editing.length > 0 && (
        <Card variant={readyCount > 0 ? "success" : undefined}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Rocket size={14} className={readyCount > 0 ? "text-[#34d399]" : "text-text-3"} />
              <CardTitle>Publish Readiness</CardTitle>
            </div>
            <span className="text-[10px] text-text-3 tabular-nums">{readyCount}/{editing.length} ready</span>
          </CardHeader>
          <div className="flex flex-col gap-1.5">
            {editing.map(({ v, checks, ready }) => (
              <div key={v.id + "_ready"} className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-600 text-text-1 truncate">{v.title}</p>
                  <div className="flex items-center gap-2.5 mt-1">
                    {checks.map(c => (
                      <span key={c.label} className={`text-[9px] inline-flex items-center gap-0.5 ${c.ok ? "text-[#34d399]" : "text-text-3"}`}>
                        {c.ok ? <Check size={9} /> : <Circle size={9} />} {c.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ready
                    ? <Badge variant="success">Ready</Badge>
                    : <span className="text-[10px] text-text-3 tabular-nums">{checks.filter(c => c.ok).length}/4</span>}
                  {v.notionUrl && (
                    <a href={v.notionUrl} target="_blank" rel="noopener noreferrer" className="text-text-3 hover:text-accent transition-colors">
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Attention Queue */}
      <Card variant={totalAttention > 0 ? "warning" : undefined}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className={totalAttention > 0 ? "text-warning" : "text-text-3"} />
            <CardTitle>Attention Queue</CardTitle>
          </div>
          {totalAttention > 0 && <Badge variant="warning">{totalAttention}</Badge>}
        </CardHeader>

        {totalAttention === 0 ? (
          <p className="text-[12px] text-text-3 py-1">All clear — nothing needs attention.</p>
        ) : (
          <div className="flex flex-col gap-4">

            {stuck.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-widest text-danger px-1 mb-1">
                  Stuck · {stuck.length}
                </p>
                {stuck.map(({ v, age }) => (
                  <AttentionItem
                    key={v.id + "_stuck"}
                    title={v.title}
                    sub={`${v.status} · ${age}d in stage`}
                    dotColor="#f87171"
                    notionUrl={v.notionUrl}
                    promptText={`/sv-pipeline\nContinue "${v.title}" — it's been ${age} days in ${v.status}. What's blocking this?`}
                    copyId={v.id + "_stuck"}
                    copied={copied}
                    onCopy={copyPrompt}
                  />
                ))}
              </div>
            )}

            {needsRepurpose.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-widest text-warning px-1 mb-1">
                  Needs Repurpose · {needsRepurpose.length}
                </p>
                {needsRepurpose.map(v => (
                  <AttentionItem
                    key={v.id + "_rep"}
                    title={v.title}
                    sub={`Live · ${v.views > 0 ? fmtViews(v.views) + " views" : "no views yet"} · no clips`}
                    dotColor="#fbbf24"
                    notionUrl={v.notionUrl}
                    promptText={`/sv-pipeline\nRepurpose "${v.title}" — extract 2-3 clips for Shorts/Reels. Paste the transcript or YouTube URL.`}
                    copyId={v.id + "_rep"}
                    copied={copied}
                    onCopy={copyPrompt}
                  />
                ))}
              </div>
            )}

            {staleViews.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-widest text-accent px-1 mb-1">
                  Stale Views · {staleViews.length}
                </p>
                {staleViews.map(v => (
                  <AttentionItem
                    key={v.id + "_views"}
                    title={v.title}
                    sub={`Published ${daysSince(v.publishDate)}d ago · ${fmtViews(v.views)} views recorded`}
                    dotColor="#1D9BF0"
                    notionUrl={v.notionUrl}
                    promptText={null}
                    copyId={v.id + "_views"}
                    copied={copied}
                    onCopy={copyPrompt}
                  />
                ))}
              </div>
            )}

          </div>
        )}
      </Card>

      {/* Pipeline Velocity */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Velocity</CardTitle>
          <span className="text-[10px] text-text-3">avg days in stage</span>
        </CardHeader>
        <div className="grid grid-cols-5 gap-2">
          {velocity.map(({ status, count, avgDays }) => (
            <div key={status} className="flex flex-col items-center gap-1 px-2 py-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
              <p className="text-[20px] font-700 tabular-nums text-text-1">{count}</p>
              <p className="text-[9px] uppercase tracking-widest text-text-3">{status}</p>
              {count > 0 && avgDays !== null && (
                <p className="text-[9px] text-text-3 tabular-nums mt-0.5">{avgDays}d</p>
              )}
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
}

function AttentionItem({
  title, sub, dotColor, notionUrl, promptText, copyId, copied, onCopy,
}: {
  title: string;
  sub: string;
  dotColor: string;
  notionUrl: string | null;
  promptText: string | null;
  copyId: string;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  const isCopied = copied === copyId;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.03)]">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-600 text-text-1 truncate">{title}</p>
        <p className="text-[10px] text-text-3">{sub}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {promptText && (
          <button
            onClick={() => onCopy(copyId, promptText)}
            className={`text-[10px] px-2 py-0.5 rounded-[6px] font-500 transition-all ${
              isCopied
                ? "bg-[rgba(52,211,153,0.15)] text-[#34d399]"
                : "bg-[rgba(255,255,255,0.06)] text-text-3 hover:text-text-1 hover:bg-[rgba(255,255,255,0.1)]"
            }`}
          >
            {isCopied ? "Copied!" : "Copy prompt"}
          </button>
        )}
        {notionUrl && (
          <a
            href={notionUrl} target="_blank" rel="noopener noreferrer"
            className="text-text-3 hover:text-accent transition-colors"
          >
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </div>
  );
}

// ── INBOX TAB ──────────────────────────────────────────────
interface Idea {
  id: string;
  text: string;
  source: string | null;
  promoted: boolean;
  promoted_at: string | null;
  notion_page_id: string | null;
  created_at: string;
}

function InboxTab({ onPromoted }: { onPromoted: () => void }) {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "promoted">("pending");
  const [captureText, setCaptureText] = useState("");
  const [adding, setAdding] = useState(false);
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [promotePillar, setPromotePillar] = useState<Pillar>("Building AI Systems");
  const [promoteType, setPromoteType] = useState<VidType>("Long Form");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (isDemoMode) { setIdeas(DEMO_IDEAS as any); return; }
    try {
      const r = await fetch("/api/ideas");
      const d = await r.json();
      if (d.ideas) setIdeas(d.ideas);
      else if (d.error) toast.error("Couldn't load inbox", d.error);
    } catch (e: any) {
      toast.error("Network error", e?.message);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function addIdea() {
    if (!captureText.trim()) return;
    setAdding(true);
    try {
      const r = await fetch("/api/ideas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: captureText, source: "inbox" }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
      setCaptureText("");
      // Optimistic add
      if (d.idea) setIdeas(prev => prev ? [d.idea, ...prev] : [d.idea]);
    } catch (e: any) {
      toast.error("Couldn't save idea", e?.message);
    } finally {
      setAdding(false);
    }
  }

  async function deleteIdea(id: string) {
    setIdeas(prev => prev?.filter(i => i.id !== id) ?? null);
    try {
      await fetch("/api/ideas", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }

  async function promote(id: string) {
    setBusyId(id);
    try {
      const r = await fetch("/api/ideas/promote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pillar: promotePillar, type: promoteType }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? "Promote failed");
      toast.success("Promoted to Pipeline", "Now lives in Notion as an Idea");
      setPromoteId(null);
      load();
      onPromoted();
    } catch (e: any) {
      toast.error("Couldn't promote", e?.message);
    } finally {
      setBusyId(null);
    }
  }

  const filtered = (ideas ?? []).filter(i => {
    if (filter === "pending")  return !i.promoted;
    if (filter === "promoted") return i.promoted;
    return true;
  });

  const pendingCount = (ideas ?? []).filter(i => !i.promoted).length;
  const promotedCount = (ideas ?? []).filter(i => i.promoted).length;

  return (
    <div className="flex flex-col gap-4 animate-fade-up stagger-3">
      {/* Quick capture */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-accent" />
            <CardTitle>Capture an Idea</CardTitle>
          </div>
        </CardHeader>
        <div className="flex gap-2">
          <input
            value={captureText}
            onChange={e => setCaptureText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addIdea(); }}
            placeholder="Spark of an idea, doesn't have to be a finished concept…"
            className="flex-1 px-3 py-2.5 text-[14px]"
          />
          <Button variant="primary" size="md" onClick={addIdea} loading={adding} disabled={!captureText.trim()}>
            <Plus size={14} /> Add
          </Button>
        </div>
        <p className="text-[10px] text-text-3 mt-2">Tip: Cmd+K from anywhere → &quot;Quick capture idea&quot; drops here</p>
      </Card>

      {/* Filter */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-[10px]">
        {([
          { k: "pending",  l: `Pending (${pendingCount})` },
          { k: "promoted", l: `Promoted (${promotedCount})` },
          { k: "all",      l: "All" },
        ] as const).map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            className={`flex-1 py-1.5 rounded-[8px] text-[11px] font-600 transition-all ${
              filter === f.k ? "bg-accent-dim text-accent" : "text-text-3 hover:text-text-2"
            }`}
          >{f.l}</button>
        ))}
      </div>

      {/* List */}
      {!ideas ? (
        <Card><SkeletonRows count={4} /></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title={filter === "pending" ? "Inbox is empty" : filter === "promoted" ? "Nothing promoted yet" : "No ideas yet"}
            body={filter === "pending" ? "Capture sparks here, promote them when they're ready to be real videos." : undefined}
            size="md"
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col gap-2">
            {filtered.map(idea => {
              const isOpen = promoteId === idea.id;
              return (
                <div key={idea.id} className="rounded-[12px] bg-[rgba(255,255,255,0.03)] border border-border-dim overflow-hidden">
                  <div className="flex items-start gap-3 px-3 py-3">
                    <Sparkles size={13} className={`flex-shrink-0 mt-0.5 ${idea.promoted ? "text-success" : "text-accent"}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] leading-snug ${idea.promoted ? "text-text-3 line-through" : "text-text-1"}`}>
                        {idea.text}
                      </p>
                      <p className="text-[10px] text-text-3 mt-1">
                        {idea.promoted ? `Promoted ${new Date(idea.promoted_at ?? idea.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: config.locale.timezone })}` : new Date(idea.created_at).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: config.locale.timezone })}
                        {idea.source && idea.source !== "inbox" && ` · ${idea.source}`}
                      </p>
                    </div>
                    {idea.promoted ? (
                      idea.notion_page_id && (
                        <a
                          href={`https://www.notion.so/${idea.notion_page_id.replace(/-/g, "")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-text-3 hover:text-accent transition-colors p-1"
                          title="Open in Notion"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )
                    ) : (
                      <button
                        onClick={() => setPromoteId(isOpen ? null : idea.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-[8px] text-[11px] font-600 bg-accent-dim text-accent hover:bg-[rgba(29,155,240,0.22)] transition-all"
                      >
                        <ArrowUpRight size={11} /> Promote
                      </button>
                    )}
                    <button
                      onClick={() => deleteIdea(idea.id)}
                      className="text-text-3 hover:text-danger transition-colors p-1"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border-dim flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1 block">Pillar</label>
                          <select value={promotePillar} onChange={e => setPromotePillar(e.target.value as Pillar)} className="w-full px-3 py-1.5 text-[12px]">
                            {PILLARS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-widest text-text-3 mb-1 block">Type</label>
                          <select value={promoteType} onChange={e => setPromoteType(e.target.value as VidType)} className="w-full px-3 py-1.5 text-[12px]">
                            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <Button variant="primary" size="sm" onClick={() => promote(idea.id)} loading={busyId === idea.id} className="w-full">
                        <ArrowUpRight size={12} /> Promote to Notion Pipeline
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

