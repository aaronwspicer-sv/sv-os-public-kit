"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, BookOpen, Target, DollarSign, Video, Calendar, Settings,
  LogOut, Trophy, Clock, Timer, CalendarRange, FolderClosed, FolderOpen,
  ChevronRight, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SvMark } from "@/components/SvMark";
import { config } from "@/config";

type Item = { href: string; icon: any; label: string };
type Folder = { folder: string; icon: any; items: Item[] };
type Entry = Item | Folder;

// The deck plan. Pinned rooms sit top-level; the rest fold into folders that
// bloom open. Alfred can teleport to any of these via navigate_to regardless.
const NAV: Entry[] = [
  { href: "/d",         icon: LayoutDashboard, label: "Bridge" },
  { href: "/d/entry",   icon: BookOpen,        label: "Daily Entry" },
  { folder: "Days", icon: Clock, items: [
    { href: "/d/time",     icon: Timer,         label: "Focus" },
    { href: "/d/timeline", icon: Clock,         label: "Timeline" },
    { href: "/d/year",     icon: CalendarRange, label: "Year" },
  ]},
  { folder: "Plan", icon: Target, items: [
    { href: "/d/goals",    icon: Target,        label: "Goals" },
    { href: "/d/calendar", icon: Calendar,      label: "Calendar" },
  ]},
  { href: "/d/finances", icon: DollarSign, label: "Money" },
  { href: "/d/content",  icon: Video,      label: "Content" },
  { href: "/d/alfred",   icon: Sparkles,   label: "Alfred" },
  ...(config.features.jays ? [{ href: "/d/jays", icon: Trophy, label: "Jays" } as Item] : []),
  { href: "/d/settings", icon: Settings,   label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/d" ? pathname === "/d" : pathname.startsWith(href);
}

function NavLink({ item, indented }: { item: Item; indented?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-500",
        "transition-all duration-200 ease-[var(--ease-glide)]",
        indented && "ml-3 py-2",
        active
          ? "bg-[rgba(29,155,240,0.10)] text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
          : "text-text-2 hover:bg-[rgba(255,255,255,0.04)] hover:text-text-1"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent"
          style={{ boxShadow: "0 0 8px rgba(29,155,240,0.6)" }} />
      )}
      <Icon size={indented ? 15 : 16} strokeWidth={active ? 2.4 : 2} />
      {item.label}
    </Link>
  );
}

function NavFolder({ folder }: { folder: Folder }) {
  const pathname = usePathname();
  const hasActive = folder.items.some(i => isActive(pathname, i.href));
  const [open, setOpen] = useState(hasActive);
  const Icon = open || hasActive ? FolderOpen : FolderClosed;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-500 transition-all duration-200",
          hasActive ? "text-accent" : "text-text-2 hover:bg-[rgba(255,255,255,0.04)] hover:text-text-1"
        )}
      >
        <Icon size={16} strokeWidth={2} />
        {folder.folder}
        <ChevronRight size={14} className={cn("ml-auto text-text-3 transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 animate-fade-up">
          {folder.items.map(it => <NavLink key={it.href} item={it} indented />)}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    try { sessionStorage.removeItem("spicer_booted"); } catch {}
    try { sessionStorage.removeItem("spicer_os_pin_unlocked"); } catch {}
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="hidden md:flex flex-col w-[220px] h-screen fixed left-0 top-0 z-40 glass-3 border-r border-border-dim">
      <div className="px-5 py-4 border-b border-border-dim flex items-center gap-2.5">
        <SvMark size={28} />
        <span className="text-[13px] font-700 tracking-tight text-text-1 leading-tight">{config.brand.name}</span>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {NAV.map((entry, i) =>
          "folder" in entry
            ? <NavFolder key={`f-${entry.folder}`} folder={entry} />
            : <NavLink key={entry.href} item={entry} />
        )}
      </nav>

      <div className="px-3 py-4 border-t border-border-dim">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-[10px] text-[13px] font-500 text-text-3 hover:text-danger hover:bg-[rgba(248,113,113,0.08)] transition-all duration-200"
        >
          <LogOut size={16} strokeWidth={2} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
