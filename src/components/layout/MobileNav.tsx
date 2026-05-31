"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Target, DollarSign, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

const tabs = [
  { href: "/d",          icon: Home,       label: "Home" },
  { href: "/d/log",      icon: BookOpen,   label: "Log" },
  { href: "/d/goals",    icon: Target,     label: "Goals" },
  { href: "/d/finances", icon: DollarSign, label: "Finances" },
  { href: "/d/content",  icon: Video,      label: "Content" },
];

export function MobileNav() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  const activeIdx = tabs.findIndex(t =>
    t.href === "/d" ? pathname === "/d" : pathname.startsWith(t.href)
  );

  // Position the sliding pill indicator over the active tab
  useEffect(() => {
    if (!containerRef.current || activeIdx < 0) return;
    const el = containerRef.current.querySelectorAll<HTMLAnchorElement>("a")[activeIdx];
    if (!el) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setIndicator({ left: rect.left - containerRect.left, width: rect.width });
  }, [activeIdx, pathname]);

  return (
    <nav className="md:hidden fixed bottom-3 left-3 right-3 z-40">
      <div
        ref={containerRef}
        className="relative surface-solid rounded-[20px] px-1.5 py-1.5 flex"
      >
        {/* Sliding active pill */}
        {indicator && (
          <span
            className="absolute top-1.5 bottom-1.5 rounded-[16px] bg-[rgba(29,155,240,0.14)] border border-[rgba(29,155,240,0.28)]"
            style={{
              left: indicator.left,
              width: indicator.width,
              transition: "left 0.4s var(--ease-spring), width 0.4s var(--ease-spring)",
              boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.08), 0 0 16px rgba(29,155,240,0.18)",
            }}
          />
        )}

        {tabs.map(({ href, icon: Icon, label }) => {
          const active = href === "/d" ? pathname === "/d" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative z-10 flex-1 flex flex-col items-center gap-0.5 py-1.5 transition-colors duration-200",
                active ? "text-accent" : "text-text-3"
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px] font-600 tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
