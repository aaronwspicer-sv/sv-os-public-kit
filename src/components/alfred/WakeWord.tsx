"use client";
// Continuous browser-side wake-word listener (Web Speech API).
// When the wake phrase fires, dispatches `alfred:wake` on window.
// AlfredFab listens for it → opens chat + starts voice mode.
//
// NOTES + CAVEATS
// - Web Speech API exists in Chrome/Edge/Safari with vendor prefixes.
//   This component degrades silently on unsupported browsers (e.g. Firefox).
// - Browser cloud STT is used (Chrome → Google, Safari → Apple). The OS
//   doesn't ship the captured audio anywhere — only the wake-phrase trigger
//   fires, and even then it just opens our local Realtime session.
// - Recognition stops on tab blur / network blips; we auto-restart.
// - User must opt-in in Settings. Default OFF (battery + privacy).
import { useEffect, useRef, useState } from "react";

const ENABLE_KEY = "alfred_wake_enabled";
const PHRASE_KEY = "alfred_wake_phrase";
export const DEFAULT_PHRASES = ["hey alfred", "okay alfred", "yo alfred"];

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // On by default — only off if user explicitly disabled it
  try { return localStorage.getItem(ENABLE_KEY) !== "0"; } catch { return true; }
}
function loadPhrases(): string[] {
  if (typeof window === "undefined") return DEFAULT_PHRASES;
  try {
    const raw = localStorage.getItem(PHRASE_KEY);
    if (!raw) return DEFAULT_PHRASES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(s => typeof s === "string")) return parsed;
  } catch {}
  return DEFAULT_PHRASES;
}

export function WakeWord() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const recRef = useRef<any>(null);
  const phrasesRef = useRef<string[]>(DEFAULT_PHRASES);
  const cooldownUntilRef = useRef<number>(0);

  // Tracks whether the Realtime voice session is currently active.
  // While voice is active, we must NOT hold the mic via SpeechRecognition —
  // browsers only let one consumer claim the mic, so the wake-word recogniser
  // would block getUserMedia.
  const [voiceActive, setVoiceActive] = useState(false);

  // Initial load + listen for settings + voice-state changes
  useEffect(() => {
    setEnabled(loadEnabled());
    phrasesRef.current = loadPhrases();
    const onStorage = (e: StorageEvent) => {
      if (e.key === ENABLE_KEY) setEnabled(loadEnabled());
      if (e.key === PHRASE_KEY) phrasesRef.current = loadPhrases();
    };
    window.addEventListener("storage", onStorage);
    const onLocal = () => { setEnabled(loadEnabled()); phrasesRef.current = loadPhrases(); };
    window.addEventListener("alfred:wake-config", onLocal);
    const onVoiceStart = () => setVoiceActive(true);
    const onVoiceEnd   = () => setVoiceActive(false);
    window.addEventListener("alfred:realtime-start", onVoiceStart);
    window.addEventListener("alfred:realtime-end",   onVoiceEnd);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("alfred:wake-config", onLocal);
      window.removeEventListener("alfred:realtime-start", onVoiceStart);
      window.removeEventListener("alfred:realtime-end",   onVoiceEnd);
    };
  }, []);

  // Probe browser support
  useEffect(() => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  useEffect(() => {
    if (!enabled || !supported) return;
    if (voiceActive) return; // Realtime owns the mic — stay quiet
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event: any) => {
      // Cooldown so a single wake doesn't fire repeatedly while we're
      // also launching Realtime (which uses the same mic — keep clean).
      if (Date.now() < cooldownUntilRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = String(event.results[i][0]?.transcript ?? "").toLowerCase().trim();
        if (!text) continue;
        const hit = phrasesRef.current.find(p => text.includes(p.toLowerCase()));
        if (hit) {
          cooldownUntilRef.current = Date.now() + 5000;
          // Pass any words after the wake phrase as a follow-on (optional)
          const idx = text.indexOf(hit.toLowerCase());
          const follow = text.slice(idx + hit.length).trim();
          window.dispatchEvent(new CustomEvent("alfred:wake", { detail: { follow, voice: true } }));
          // Stop the wake recogniser so Realtime can grab the mic cleanly.
          try { rec.stop(); } catch {}
          return;
        }
      }
    };

    rec.onerror = (e: any) => {
      // Errors fire often (no-speech, audio-capture) — let onend restart
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        console.warn("WakeWord permission denied");
      }
    };
    rec.onend = () => {
      // Auto-restart so we keep listening — unless component unmounted
      if (!enabled) return;
      // Slight delay so we don't spin if rec is failing fast
      setTimeout(() => {
        if (!enabled) return;
        try { rec.start(); } catch {}
      }, 600);
    };

    try { rec.start(); } catch (err: any) {
      console.warn("WakeWord start failed", err?.message);
    }
    recRef.current = rec;
    return () => {
      try { rec.onend = null; rec.stop(); } catch {}
      recRef.current = null;
    };
  }, [enabled, supported, voiceActive]);

  return null;
}
