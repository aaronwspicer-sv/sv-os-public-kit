"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, Target, DollarSign, Video, Calendar, Settings, LogOut, Trophy, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SvMark } from "@/components/SvMark";
import { config } from "@/config";

const nav = [
  { href: "/d",          icon: Home,        label: "Home" },
  { href: "/d/log",      icon: BookOpen,    label: "Daily Log" },
  { href: "/d/goals",    icon: Target,      label: "Goals" },
  { href: "/d/finances", icon: DollarSign,  label: "Finances" },
  { href: "/d/content",  icon: Video,       label: "Content" },
  { href: "/d/calendar", icon: Calendar,    label: "Calendar" },
  { href: "/d/timeline", icon: Clock,       label: "Timeline" },
  // Jays — gated; personal/Toronto feature
  ...(config.features.jays ? [{ href: "/d/jays", icon: Trophy, label: "Jays" }] : []),
  { href: "/d/settings", icon: Settings,    label: "Security" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    // Clear 2FA cookie + sessionStorage flags so the next session is clean
    try { sessionStorage.removeItem("spicer_booted"); } catch {}
    try { sessionStorage.removeItem("spicer_os_pin_unlocked"); } catch {}
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="hidden md:flex flex-col w-[220px] h-screen fixed left-0 top-0 z-40 glass-3 border-r border-border-dim">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border-dim flex items-center gap-2.5">
        <SvMark size={28} />
        <span className="text-[13px] font-700 tracking-tight text-text-1 leading-tight">
          {config.brand.name}
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {nav.map(({ href, icon: Icon, label }) => {
          // Dashboard home (/d) needs exact match — otherwise it'd "win"
          // the active state for every child route (/d/log etc.).
          const active = href === "/d" ? pathname === "/d" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-500",
                "transition-all duration-200 ease-[var(--ease-glide)]",
                active
                  ? "bg-[rgba(29,155,240,0.10)] text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                  : "text-text-2 hover:bg-[rgba(255,255,255,0.04)] hover:text-text-1"
              )}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent"
                  style={{ boxShadow: "0 0 8px rgba(29,155,240,0.6)" }}
                />
              )}
              <Icon size={16} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
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
