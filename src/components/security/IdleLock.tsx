"use client";
// Idle auto-lock. After N minutes of no mouse / key / touch / scroll activity,
// clears the PIN session and reloads — PinGate then re-prompts.
//
// Setting lives in localStorage (`spicer_os_idle_minutes`, default 15).
// Value 0 disables the auto-lock entirely.
//
// On every tick we also re-check sessionStorage in case it was cleared
// elsewhere (e.g. another tab logged out).
import { useEffect, useRef } from "react";

const PIN_SESSION_KEY  = "spicer_os_pin_unlocked";
const IDLE_SETTING_KEY = "spicer_os_idle_minutes";
const DEFAULT_MINUTES  = 15;

function getIdleMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_MINUTES;
  try {
    const raw = localStorage.getItem(IDLE_SETTING_KEY);
    if (raw == null) return DEFAULT_MINUTES;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MINUTES;
  } catch {
    return DEFAULT_MINUTES;
  }
}

export function IdleLock() {
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const bump = () => { lastActivity.current = Date.now(); };

    // Passive listeners — never block UI. Throttled scroll via rAF batching.
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("mousemove",   bump, opts);
    window.addEventListener("mousedown",   bump, opts);
    window.addEventListener("keydown",     bump, opts);
    window.addEventListener("touchstart",  bump, opts);
    window.addEventListener("scroll",      bump, opts);
    window.addEventListener("wheel",       bump, opts);
    window.addEventListener("visibilitychange", bump);

    // Storage event lets settings page changes take effect instantly
    // (no need to set up a context — localStorage already broadcasts).

    const interval = window.setInterval(() => {
      const minutes = getIdleMinutes();
      if (minutes <= 0) return; // disabled
      const idleMs = Date.now() - lastActivity.current;
      if (idleMs < minutes * 60_000) return;

      // Time out — clear PIN session, also try to lock the finance vault.
      try { sessionStorage.removeItem(PIN_SESSION_KEY); } catch {}
      fetch("/api/finance/lock", { method: "POST" }).catch(() => {});
      // Hard nav forces PinGate to re-evaluate. Land on dashboard root.
      window.location.href = "/d";
    }, 15_000); // check every 15s

    return () => {
      window.removeEventListener("mousemove",   bump, opts);
      window.removeEventListener("mousedown",   bump, opts);
      window.removeEventListener("keydown",     bump, opts);
      window.removeEventListener("touchstart",  bump, opts);
      window.removeEventListener("scroll",      bump, opts);
      window.removeEventListener("wheel",       bump, opts);
      window.removeEventListener("visibilitychange", bump);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
