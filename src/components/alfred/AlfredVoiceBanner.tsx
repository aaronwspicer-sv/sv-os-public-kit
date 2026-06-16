"use client";
import { usePathname } from "next/navigation";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useRealtimeCtx } from "@/lib/alfred/realtimeContext";

export function AlfredVoiceBanner() {
  const pathname = usePathname();
  const realtime = useRealtimeCtx();
  const voiceLive = realtime.phase !== "idle";

  // Only show on non-console pages when a voice session is active
  if (!voiceLive || pathname === "/d") return null;

  const phaseLabel =
    realtime.phase === "speaking" ? "Speaking" :
    realtime.phase === "thinking" ? "Thinking" : "Listening";

  const partial =
    realtime.phase === "speaking" ? realtime.partialAlfred : realtime.partialUser;

  return (
    <div
      className="fixed z-[55] flex items-center gap-3 px-4 py-2.5"
      style={{
        bottom: "calc(44px + 1.5rem)",
        right: "1.25rem",
        borderRadius: "16px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
        border: "1px solid rgba(29,155,240,0.3)",
        borderTop: "1px solid rgba(29,155,240,0.5)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 16px rgba(29,155,240,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Pulse dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{
          background: "rgba(29,155,240,0.9)",
          boxShadow: "0 0 6px rgba(29,155,240,0.6)",
          animation: "alfred-pulse 1.2s ease-in-out infinite",
        }}
      />

      {/* Label + partial transcript */}
      <div className="flex flex-col min-w-0 max-w-[160px]">
        <span
          className="text-[10px] font-700 uppercase tracking-[0.16em] leading-none mb-0.5"
          style={{ color: "rgba(29,155,240,0.9)" }}
        >
          Alfred · {phaseLabel}
        </span>
        {partial && (
          <span className="text-[11px] text-text-2 truncate">{partial}</span>
        )}
      </div>

      {/* Mute */}
      <button
        onClick={realtime.toggleMute}
        title={realtime.muted ? "Unmute" : "Mute"}
        className="w-7 h-7 rounded-[8px] flex items-center justify-center border transition-all"
        style={{
          background: realtime.muted ? "rgba(239,68,68,0.15)" : "transparent",
          borderColor: realtime.muted ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.1)",
          color: realtime.muted ? "rgba(239,68,68,0.9)" : "rgba(255,255,255,0.45)",
        }}
      >
        {realtime.muted ? <MicOff size={12} /> : <Mic size={12} />}
      </button>

      {/* End session */}
      <button
        onClick={realtime.disconnect}
        title="End voice session"
        className="w-7 h-7 rounded-[8px] flex items-center justify-center transition-all"
        style={{
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.35)",
          color: "rgba(239,68,68,0.9)",
        }}
      >
        <PhoneOff size={12} />
      </button>
    </div>
  );
}
