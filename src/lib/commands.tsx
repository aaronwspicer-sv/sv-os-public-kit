// The command registry — ONE source of truth for everything you can command in
// the OS. The three doors all read from this:
//   • Cmd+K   (type)  — renders this as the palette
//   • Bridge  (helm)  — renders this as quick-action tiles + the omni-input
//   • Alfred  (talk)  — each command notes the alfredTool that does the same
// Define a command once here → it shows up everywhere. Don't add per-page
// command menus; add a command here instead.
import type { ComponentType } from "react";
import {
  Target, Sparkles, Film, MessageSquare, Calendar, Home, BookOpen, DollarSign,
  Video, Settings, Bot, Timer, RefreshCw, Clock,
} from "lucide-react";
import { getActiveDateString, getTomorrowDateString } from "@/lib/utils";

export type CommandKind = "navigate" | "input" | "textarea" | "action";
export type CommandGroup = "Create" | "Content" | "Go to";

/** Runtime deps a command needs (kept minimal so any door can supply them). */
export interface CommandCtx {
  toast: { success: (t: string, d?: string) => void; error: (t: string, d?: string) => void };
}

export interface Command {
  id: string;
  kind: CommandKind;
  group: CommandGroup;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint?: string;
  href?: string;              // navigate
  placeholder?: string;       // input / textarea
  submitLabel?: string;
  onSubmit?: (value: string) => Promise<void>; // input / textarea
  run?: () => Promise<void>;  // action (no input)
  /** The Alfred tool that performs the same thing (so "talk" matches "type"). */
  alfredTool?: string;
}

/** Build the registry, binding handlers to the door's toast. */
export function buildCommands(ctx: CommandCtx): Command[] {
  const { toast } = ctx;
  return [
    // ── Create ──────────────────────────────────────────────
    {
      id: "todo-today", kind: "input", group: "Create", icon: Target,
      label: "Add todo for today", placeholder: "What do you want to accomplish today?",
      submitLabel: "Add", alfredTool: "add_todo",
      onSubmit: async (text) => {
        const r = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, date: getActiveDateString() }) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to add todo");
        toast.success("Todo added", text);
      },
    },
    {
      id: "todo-tomorrow", kind: "input", group: "Create", icon: Target,
      label: "Add todo for tomorrow", placeholder: "What do you want to accomplish tomorrow?",
      submitLabel: "Add", alfredTool: "add_todo",
      onSubmit: async (text) => {
        const r = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, date: getTomorrowDateString() }) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to add todo");
        toast.success("Todo added for tomorrow", text);
      },
    },
    {
      id: "idea-inbox", kind: "input", group: "Create", icon: Sparkles,
      label: "Quick capture idea", hint: "Drops into Content → Inbox · promote later",
      placeholder: "Spark of an idea, doesn't need to be finished…", submitLabel: "Capture",
      onSubmit: async (text) => {
        const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, source: "cmdk" }) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
        toast.success("Captured to inbox", text);
      },
    },
    {
      id: "video-idea-direct", kind: "input", group: "Create", icon: Film,
      label: "New video → Pipeline (skip Inbox)", hint: "Creates a Notion SV Videos entry as Idea",
      placeholder: "Why I built this at 17…", submitLabel: "Create", alfredTool: "pipeline_create",
      onSubmit: async (text) => {
        const r = await fetch("/api/notion/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: text }) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed");
        toast.success("Video idea created in Pipeline", text);
      },
    },
    {
      id: "journal-jot", kind: "textarea", group: "Create", icon: MessageSquare,
      label: "Quick journal note", hint: "Appends to today's mindset notes",
      placeholder: "What's on your mind…", submitLabel: "Append",
      onSubmit: async (text) => {
        const cur = await fetch("/api/notion/log").then(r => r.json()).catch(() => ({ entry: null }));
        const existing = cur.entry?.mindsetNotes ?? "";
        const merged = `${existing}${existing ? "\n\n" : ""}${text}`;
        const next = { ...(cur.entry ?? {}), mindsetNotes: merged };
        const r = await fetch("/api/notion/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Failed to save journal");
        toast.success("Saved to journal");
      },
    },

    // ── Content (was the buried "Command" tab) ──────────────
    {
      id: "sync-views", kind: "action", group: "Content", icon: RefreshCw,
      label: "Sync YouTube views", hint: "Pull the latest view counts into the pipeline",
      alfredTool: "sync_youtube_views",
      run: async () => {
        const r = await fetch("/api/cron/sync-views", { method: "POST" });
        const d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error ?? "Sync failed");
        toast.success(d.updated > 0 ? "Views synced" : "Views up to date", `${d.updated ?? 0} of ${d.checked ?? 0} updated`);
      },
    },

    // ── Go to (navigation) ──────────────────────────────────
    { id: "nav-home",     kind: "navigate", group: "Go to", icon: Home,       label: "Go to Bridge",       href: "/d" },
    { id: "nav-entry",    kind: "navigate", group: "Go to", icon: BookOpen,   label: "Go to Daily Entry",  href: "/d/entry" },
    { id: "nav-history",  kind: "navigate", group: "Go to", icon: BookOpen,   label: "Entry history",      href: "/d/entry/history" },
    { id: "nav-goals",    kind: "navigate", group: "Go to", icon: Target,     label: "Go to Goals",        href: "/d/goals" },
    { id: "nav-finances", kind: "navigate", group: "Go to", icon: DollarSign, label: "Go to Money",        href: "/d/finances" },
    { id: "nav-content",  kind: "navigate", group: "Go to", icon: Video,      label: "Go to Content",      href: "/d/content" },
    { id: "nav-calendar", kind: "navigate", group: "Go to", icon: Calendar,   label: "Go to Calendar",     href: "/d/calendar" },
    { id: "nav-focus",    kind: "navigate", group: "Go to", icon: Timer,      label: "Go to Focus",        href: "/d/time" },
    { id: "nav-timeline", kind: "navigate", group: "Go to", icon: Clock,      label: "Timeline",           href: "/d/timeline" },
    { id: "nav-year",     kind: "navigate", group: "Go to", icon: Calendar,   label: "Year stats",         href: "/d/year" },
    { id: "nav-alfred",   kind: "navigate", group: "Go to", icon: Bot,        label: "Go to Alfred cockpit", href: "/d/alfred" },
    { id: "nav-settings", kind: "navigate", group: "Go to", icon: Settings,   label: "Go to Settings",     href: "/d/settings" },
  ];
}
