"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useRealtime, type UseRealtimeApi } from "./useRealtime";

const RealtimeCtx = createContext<UseRealtimeApi | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const rt = useRealtime({
    // Voice-initiated navigation: skip docking so VoiceBanner shows on the new page
    onNavigate: (url) => {
      window.dispatchEvent(new CustomEvent("alfred:nav-start", { detail: { url } }));
    },
    onUserTurn:   (text)        => window.dispatchEvent(new CustomEvent("alfred:voice-user-turn",    { detail: { text } })),
    onAlfredTurn: (text)        => window.dispatchEvent(new CustomEvent("alfred:voice-alfred-turn",  { detail: { text } })),
    onAlfredDelta: (_d, full)   => window.dispatchEvent(new CustomEvent("alfred:voice-alfred-delta", { detail: { full } })),
    onToolCall:   (name, result) => window.dispatchEvent(new CustomEvent("alfred:voice-tool-call",   { detail: { name, result } })),
  });

  return <RealtimeCtx.Provider value={rt}>{children}</RealtimeCtx.Provider>;
}

export function useRealtimeCtx(): UseRealtimeApi {
  const ctx = useContext(RealtimeCtx);
  if (!ctx) throw new Error("useRealtimeCtx must be used inside <RealtimeProvider>");
  return ctx;
}
