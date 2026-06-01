"use client";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { EyeOff, X } from "lucide-react";

export function DemoModeBanner() {
  const { isDemoMode, disableDemoMode } = useDemoMode();
  if (!isDemoMode) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] flex items-center justify-center gap-2 px-4 py-2 text-[12px] font-700 tracking-[0.12em] uppercase"
      style={{ background: "rgba(251,146,60,0.96)", backdropFilter: "blur(8px)", boxShadow: "0 2px 12px rgba(251,146,60,0.4)" }}
    >
      <EyeOff size={13} />
      <span>Demo Mode · Real data hidden</span>
      <span className="text-[10px] font-500 opacity-70 ml-1 hidden sm:inline">⌘⇧D to toggle</span>
      <button
        onClick={disableDemoMode}
        aria-label="Exit demo mode"
        className="ml-3 w-5 h-5 rounded-full flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-black/20 transition-all"
      >
        <X size={11} />
      </button>
    </div>
  );
}
