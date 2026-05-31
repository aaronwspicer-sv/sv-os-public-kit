"use client";
// Pings /api/auth/sessions/ping on mount + every 2 min. If the server says
// THIS session has been revoked, we sign out immediately.
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const INTERVAL_MS = 2 * 60 * 1000;

export function SessionPing() {
  useEffect(() => {
    let cancelled = false;

    async function ping() {
      try {
        const r = await fetch("/api/auth/sessions/ping", { method: "POST", cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        if (!d) return;
        if (d.revoked && !cancelled) {
          // This device's session was revoked from another device — sign out hard.
          try { sessionStorage.removeItem("spicer_os_pin_unlocked"); } catch {}
          const supabase = createClient();
          await supabase.auth.signOut().catch(() => {});
          window.location.href = "/login?reason=revoked";
        }
      } catch {}
    }

    ping();
    const id = window.setInterval(ping, INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
