"use client";
// Persistent Alfred status strip shown on every page except /d (which has the full console).
// Shows online status, latest proactive alert text, and a quick-ask input.
// Typing a query here opens the Alfred FAB panel and sends the message.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertInfo { title: string; body: string; urgent: boolean }

export function AlfredBar() {
  const pathname = usePathname();
  const [alert, setAlert]   = useState<AlertInfo | null>(null);
  const [input, setInput]   = useState("");
  const [flash, setFlash]   = useState(false);
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as AlertInfo;
      setAlert(d);
      // Flash the bar briefly to draw attention
      setFlash(true);
      if (flashRef.current) clearTimeout(flashRef.current);
      flashRef.current = setTimeout(() => setFlash(false), 2500);
    };
    window.addEventListener("alfred:proactive-alert", h);
    return () => window.removeEventListener("alfred:proactive-alert", h);
  }, []);

  // Hide on Alfred console (it has its own full UI)
  if (pathname === "/d") return null;

  function submit() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    window.dispatchEvent(new CustomEvent("alfred:quick-ask", { detail: { query: q } }));
  }

  return (
    <div
      className={cn(
        "fixed bottom-[60px] md:bottom-0 md:left-[220px] right-0 z-30 flex items-center gap-2 px-3 h-9 transition-colors duration-500",
        flash ? "bg-[rgba(29,155,240,0.08)]" : "bg-[rgba(2,5,14,0.94)]",
      )}
      style={{ borderTop: "1px solid rgba(29,155,240,0.1)", backdropFilter: "blur(12px)" }}
    >
      {/* Status dot */}
      <span className="w-1.5 h-1.5 rounded-full bg-success flex-shrink-0"
        style={{ boxShadow: "0 0 5px rgba(52,211,153,0.7)", animation: "alfred-blink 3s ease-in-out infinite" }} />

      {/* Alert text or default status */}
      {alert ? (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("alfred:quick-ask", { detail: { query: `Tell me more about: ${alert.title}` } }))}
          className="flex items-center gap-1 flex-1 min-w-0 text-left group"
        >
          <span className={cn("text-[10px] font-mono truncate transition-colors", alert.urgent ? "text-warning" : "text-text-3 group-hover:text-text-2")}>
            {alert.title} — {alert.body}
          </span>
          <ChevronRight size={9} className="text-text-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      ) : (
        <span className="text-[10px] font-mono text-text-3 flex-1 min-w-0 truncate">
          <span className="text-accent">ALFRED</span> · ONLINE
        </span>
      )}

      {/* Quick-ask input */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Ask Alfred…"
          className="w-36 px-2 py-1 text-[10px] rounded-[5px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-text-1 placeholder:text-text-3 focus:outline-none focus:border-[rgba(29,155,240,0.3)] transition-colors"
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="w-6 h-6 rounded-[5px] flex items-center justify-center disabled:opacity-25 transition-opacity"
          style={{ background: "rgba(29,155,240,0.12)", border: "1px solid rgba(29,155,240,0.25)" }}
        >
          <Sparkles size={9} className="text-accent" />
        </button>
      </div>
    </div>
  );
}
