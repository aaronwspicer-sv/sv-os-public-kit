"use client";
// Alfred-guided walkthrough. Runs after the security wizard for new owners
// (and powers the public demo, rooms-only). Self-paced card flow, skippable
// from the first card. Content lives in @/lib/onboardingTour.
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { config } from "@/config";
import {
  TOUR_INTRO, TOUR_OUTRO, ROOM_STOPS, NOTION_SETUP_STOP, type TourStop,
} from "@/lib/onboardingTour";

const TOUR_DONE_KEY = "os_tour_done_v1";

type Card = { type: "intro" } | { type: "stop"; stop: TourStop } | { type: "outro" };

export function GuidedTour({
  mode = "onboarding",
  onDone,
}: {
  mode?: "onboarding" | "demo";
  onDone: () => void;
}) {
  const router = useRouter();
  const [cards, setCards] = useState<Card[]>([{ type: "intro" }, { type: "outro" }]);
  const [idx, setIdx] = useState(0);

  const ownerName = config.owner.name && config.owner.name !== "you" ? config.owner.name : null;
  const intro = ownerName ? TOUR_INTRO.replace("Hey —", `Hey ${ownerName} —`) : TOUR_INTRO;

  // Build the sequence. Onboarding: add the Notion setup card only if Notion
  // isn't linked. Demo: rooms only (it's pre-filled).
  useEffect(() => {
    let alive = true;
    (async () => {
      const stops: TourStop[] = [];
      if (mode === "onboarding") {
        try {
          const d = await fetch("/api/health/setup").then(r => r.json()).catch(() => null);
          const notionBroken = Array.isArray(d?.checks)
            && d.checks.some((c: any) => typeof c?.name === "string" && c.name.startsWith("notion:") && !c.ok);
          if (notionBroken) stops.push(NOTION_SETUP_STOP);
        } catch { /* skip setup card if health check unavailable */ }
      }
      stops.push(...ROOM_STOPS);
      if (!alive) return;
      setCards([{ type: "intro" }, ...stops.map(s => ({ type: "stop" as const, stop: s })), { type: "outro" }]);
    })();
    return () => { alive = false; };
  }, [mode]);

  const card = cards[idx];
  const isFirst = idx === 0;
  const isLast = idx === cards.length - 1;

  function finish() {
    try { localStorage.setItem(TOUR_DONE_KEY, "1"); } catch {}
    onDone();
  }
  function next() { isLast ? finish() : setIdx(i => i + 1); }
  function back() { setIdx(i => Math.max(0, i - 1)); }
  function startFirstEntry() { finish(); router.push("/d/entry"); }

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6">
      <div className="w-full max-w-md glass-2 rounded-[20px] border border-border-dim overflow-hidden">
        {/* Progress */}
        <div className="flex gap-1 px-5 pt-5">
          {cards.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= idx ? "bg-accent" : "bg-[rgba(255,255,255,0.08)]"}`} />
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {/* Alfred badge */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-accent-dim border border-[rgba(29,155,240,0.3)] flex items-center justify-center text-accent text-[11px] font-bold">A</div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-text-3">Alfred</span>
          </div>

          {card?.type === "intro" && (
            <p className="text-[15px] leading-relaxed text-text-1">{intro}</p>
          )}

          {card?.type === "stop" && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-accent mb-1">{card.stop.title}</p>
              <p className="text-[15px] leading-relaxed text-text-1 mb-3">{card.stop.alfred}</p>
              {card.stop.items && (
                <ul className="flex flex-col gap-2 mb-2">
                  {card.stop.items.map(it => (
                    <li key={it.name} className="flex gap-2 text-[13px] leading-snug">
                      <span className="text-accent mt-0.5 flex-shrink-0">→</span>
                      <span className="text-text-2"><span className="text-text-1 font-600">{it.name}</span> — {it.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
              {card.stop.note && (
                <p className="text-[12px] text-text-3 italic mt-2">{card.stop.note}</p>
              )}
            </div>
          )}

          {card?.type === "outro" && (
            <p className="text-[15px] leading-relaxed text-text-1">{TOUR_OUTRO}</p>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between mt-6">
            <div>
              {!isFirst && (
                <button onClick={back} className="inline-flex items-center gap-1 text-[13px] text-text-3 hover:text-text-1 transition-colors">
                  <ArrowLeft size={13} /> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!isLast && (
                <button onClick={finish} className="text-[13px] text-text-3 hover:text-text-1 transition-colors">
                  {mode === "demo" ? "Close" : "I'll explore"}
                </button>
              )}
              {card?.type === "outro" ? (
                <div className="flex items-center gap-2">
                  <button onClick={finish} className="text-[13px] text-text-3 hover:text-text-1 transition-colors px-2">I&apos;ll explore</button>
                  {mode === "onboarding" && (
                    <button onClick={startFirstEntry} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-accent text-white transition-all hover:shadow-[0_0_24px_rgba(29,155,240,0.4)]">
                      Log my first day <ArrowRight size={13} />
                    </button>
                  )}
                  {mode === "demo" && (
                    <button onClick={finish} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-accent text-white">
                      Explore the demo <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              ) : (
                <button onClick={next} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-semibold bg-accent text-white transition-all hover:shadow-[0_0_24px_rgba(29,155,240,0.4)]">
                  {isFirst ? "Show me" : "Next"} <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function tourAlreadyDone(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(TOUR_DONE_KEY) === "1"; } catch { return false; }
}
