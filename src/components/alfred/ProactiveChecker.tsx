"use client";
// Polls /api/alfred/proactive and fires browser notifications + window events.
// After 6pm the interval tightens to 60s so habit nudges feel real-time.
import { useEffect, useRef } from "react";

const SEEN_KEY      = "alfred_proactive_seen";
const POLL_FIRST_MS = 30_000;         // wait 30s on mount before first check
const POLL_DAY_MS   = 3 * 60_000;    // every 3 min during the day
const POLL_EVE_MS   = 60_000;        // every 1 min after 6pm (habit nudges)

function getSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")); } catch { return new Set(); }
}
function markSeen(id: string) {
  try {
    const s = getSeen(); s.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-300)));
  } catch {}
}
function isEvening(): boolean {
  const h = new Date().getHours();
  return h >= 18; // 6pm local (close enough — proactive route uses Toronto tz server-side)
}

export function ProactiveChecker() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useRef(async () => {
    try {
      const res = await fetch("/api/alfred/proactive");
      if (!res.ok) return;
      const { alerts } = await res.json() as {
        alerts: { id: string; title: string; body: string; urgent: boolean; kind: string }[];
      };
      const seen = getSeen();
      for (const alert of (alerts ?? [])) {
        if (seen.has(alert.id)) continue;
        markSeen(alert.id);

        // Browser notification
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(alert.title, {
            body:   alert.body,
            silent: !alert.urgent,
            tag:    alert.id,
          });
        }

        // Window event so AlfredBar can show the alert inline
        try {
          window.dispatchEvent(new CustomEvent("alfred:proactive-alert", {
            detail: { id: alert.id, title: alert.title, body: alert.body, kind: alert.kind, urgent: alert.urgent },
          }));
        } catch {}
      }
    } catch {}

    const nextMs = isEvening() ? POLL_EVE_MS : POLL_DAY_MS;
    timerRef.current = setTimeout(check.current, nextMs);
  });

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    function start() {
      timerRef.current = setTimeout(check.current, POLL_FIRST_MS);
    }

    if (Notification.permission === "granted") {
      start();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then(p => { if (p === "granted") start(); });
    }

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return null;
}
