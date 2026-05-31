"use client";
// React hook wrapping the OpenAI Realtime WebRTC session.
// Returns state + connect/disconnect/mute handlers, and calls onTurn
// callbacks when user-speech or assistant-speech transcripts complete —
// so the chat panel can append them to the unified messages array.
import { useRef, useState, useCallback, useEffect } from "react";

export type RealtimePhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

// Cost defense
const IDLE_KILL_MS   = 5 * 60 * 1000;   // 5 min of pure silence → auto-disconnect
const MAX_SESSION_MS = 60 * 60 * 1000;  // hard cap: 60 min per session

export interface UseRealtimeOpts {
  /** Fires when the user finishes a spoken turn (final transcript) */
  onUserTurn?: (text: string) => void;
  /** Fires when Alfred finishes a spoken turn (final transcript) */
  onAlfredTurn?: (text: string) => void;
  /** Fires with each delta as Alfred speaks — for live caption */
  onAlfredDelta?: (delta: string, full: string) => void;
  /** Fires when a tool is invoked + completes — for UI hints */
  onToolCall?: (name: string, result: any) => void;
  /** Called when Alfred wants to navigate. Use SPA router (e.g. router.push)
   *  to keep the WebRTC session alive across route changes. */
  onNavigate?: (url: string) => void;
}

export interface UseRealtimeApi {
  phase: RealtimePhase;
  error: string | null;
  muted: boolean;
  audioLevel: number;
  partialUser: string;
  partialAlfred: string;
  /** Whether THIS active session has tools attached (set from token-mint response) */
  toolsAttached: boolean;
  /** Which token-mint path succeeded ('new+tools', 'new', 'legacy+tools', 'legacy') */
  attempt: string | null;
  connect: (voice?: string) => Promise<void>;
  disconnect: () => void;
  toggleMute: () => void;
}

export function useRealtime(opts: UseRealtimeOpts = {}): UseRealtimeApi {
  const [phase, setPhase]               = useState<RealtimePhase>("idle");
  const [error, setError]               = useState<string | null>(null);
  const [muted, setMuted]               = useState(false);
  const [audioLevel, setAudioLevel]     = useState(0);
  const [partialUser, setPartialUser]   = useState("");
  const [partialAlfred, setPartialAlfred] = useState("");
  const [toolsAttached, setToolsAttached] = useState(false);
  const [attempt, setAttempt] = useState<string | null>(null);

  const pcRef        = useRef<RTCPeerConnection | null>(null);
  const dcRef        = useRef<RTCDataChannel | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const audioElRef   = useRef<HTMLAudioElement | null>(null);
  const ctxRef       = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const rafRef       = useRef<number | null>(null);
  const alfredBufRef = useRef<string>("");
  // Cost defense: kill the session if there's been no user OR assistant speech
  // for IDLE_KILL_MS. Realtime billing runs as long as the WebRTC is open
  // even with silence — a forgotten tab can rack up $$.
  const lastActivityRef = useRef<number>(Date.now());
  const idleTimerRef    = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(0);
  // Accumulate function call arguments across response.function_call_arguments.delta
  const toolCallsRef = useRef<Map<string, { name: string; args: string; callId: string }>>(new Map());

  // Latest callbacks (avoid stale closures)
  const cbRef = useRef(opts);
  useEffect(() => { cbRef.current = opts; }, [opts]);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (idleTimerRef.current) window.clearInterval(idleTimerRef.current);
    rafRef.current = null;
    idleTimerRef.current = null;
    try { dcRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { ctxRef.current?.close(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    dcRef.current = null; pcRef.current = null; streamRef.current = null;
    analyserRef.current = null; ctxRef.current = null;
    setAudioLevel(0); setPartialUser(""); setPartialAlfred("");
    alfredBufRef.current = "";
  }, []);

  function handleEvent(msg: any) {
    const t = msg.type;
    // Any user speech, alfred speech, or tool activity = "not idle"
    if (
      t === "input_audio_buffer.speech_started" ||
      t === "input_audio_buffer.speech_stopped" ||
      t === "response.audio_transcript.delta" ||
      t === "conversation.item.input_audio_transcription.completed" ||
      t === "response.created" ||
      t === "response.done"
    ) {
      lastActivityRef.current = Date.now();
    }
    if (t === "input_audio_buffer.speech_started") {
      setPhase("listening");
      setPartialUser("");
    }
    if (t === "input_audio_buffer.speech_stopped") {
      setPhase("thinking");
    }
    if (t === "conversation.item.input_audio_transcription.completed") {
      const text = String(msg.transcript ?? "").trim();
      setPartialUser(text);
      if (text) cbRef.current.onUserTurn?.(text);
    }
    if (t === "response.created") {
      setPhase("thinking");
      alfredBufRef.current = "";
    }
    if (t === "response.audio_transcript.delta") {
      alfredBufRef.current += (msg.delta ?? "");
      setPartialAlfred(alfredBufRef.current);
      setPhase("speaking");
      cbRef.current.onAlfredDelta?.(msg.delta ?? "", alfredBufRef.current);
    }
    if (t === "response.audio_transcript.done") {
      const text = String(msg.transcript ?? alfredBufRef.current).trim();
      setPartialAlfred(text);
      if (text) cbRef.current.onAlfredTurn?.(text);
    }
    if (t === "response.done") setPhase("listening");
    if (t === "error") {
      setError(String(msg.error?.message ?? "Realtime error"));
    }

    // ─── J1: Tool call lifecycle ───
    // Item created with a function-call type → start tracking
    if (t === "response.output_item.added" && msg.item?.type === "function_call") {
      toolCallsRef.current.set(msg.item.id, {
        name: msg.item.name ?? "",
        args: msg.item.arguments ?? "",
        callId: msg.item.call_id ?? msg.item.id,
      });
    }
    // Streaming arg chunks
    if (t === "response.function_call_arguments.delta") {
      const entry = toolCallsRef.current.get(msg.item_id);
      if (entry) entry.args += (msg.delta ?? "");
    }
    // Arguments complete → execute server-side, then submit the result back
    if (t === "response.function_call_arguments.done") {
      const entry = toolCallsRef.current.get(msg.item_id);
      if (entry) {
        entry.args = msg.arguments ?? entry.args;
        // Fire-and-forget so we don't block the audio loop
        (async () => {
          try {
            console.log("[alfred-voice] tool call:", entry.name, entry.args);
            const r = await fetch("/api/alfred/exec-tool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: entry.name, args: entry.args }),
            });
            const d = await r.json().catch(() => ({}));
            const result = d?.result ?? { error: "no result" };
            console.log("[alfred-voice] tool result:", entry.name, result);
            cbRef.current.onToolCall?.(entry.name, result);

            // Client-side side-effects for tools the server can't perform on its own
            if (entry.name === "navigate_to" && result?.url && typeof result.url === "string") {
              try {
                if (cbRef.current.onNavigate) {
                  // SPA-style navigation — keeps WebRTC + chat panel alive
                  cbRef.current.onNavigate(result.url);
                } else if (typeof window !== "undefined") {
                  // Hard nav fallback — will end the session
                  window.location.href = result.url;
                }
              } catch {}
            }

            // Send result back to OpenAI as a function_call_output item
            dcRef.current?.send(JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: entry.callId,
                output: JSON.stringify(result).slice(0, 50_000),
              },
            }));
            // Kick the model to speak after using the tool
            dcRef.current?.send(JSON.stringify({ type: "response.create" }));
          } catch (err: any) {
            console.error("voice tool exec failed:", err?.message);
          } finally {
            toolCallsRef.current.delete(msg.item_id);
          }
        })();
      }
    }
  }

  const connect = useCallback(async (voice?: string) => {
    setError(null); setPhase("connecting");
    // Tell wake-word listener to release the mic NOW
    try { window.dispatchEvent(new Event("alfred:realtime-start")); } catch {}

    // ── CRITICAL: grab the mic FIRST, before any async network work. ──
    // Safari (especially iOS) revokes permission if getUserMedia is called
    // outside the original user-gesture window. Even a single awaited fetch
    // is enough to lose the gesture context → NotAllowedError.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
    } catch (err: any) {
      const name = err?.name ?? "";
      let msg = err?.message ?? "Mic access failed";
      if (name === "NotAllowedError" || /permission denied/i.test(msg)) {
        msg = `Microphone blocked. Click the 🔒/🌐 icon left of the URL → Site settings → Microphone → Allow → reload. On iPhone: Settings → Safari → Microphone → set this site to Allow.`;
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone found on this device.";
      } else if (name === "NotReadableError") {
        msg = "Microphone is in use by another app. Close it and try again.";
      } else if (name === "SecurityError") {
        msg = "Browser blocked mic — needs HTTPS (should already be).";
      }
      setError(msg); setPhase("error");
      try { window.dispatchEvent(new Event("alfred:realtime-end")); } catch {}
      return;
    }

    try {
      const tokRes = await fetch("/api/alfred/realtime-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voice ? { voice } : {}),
      });
      const tok = await tokRes.json().catch(() => ({}));
      if (!tokRes.ok) {
        throw new Error(tok?.error ?? `token mint failed (${tokRes.status})`);
      }
      if (!tok.client_secret) throw new Error("no client_secret returned");
      setAttempt(tok.attempt ?? null);
      setToolsAttached(!!tok.toolsAttached);
      console.log("[alfred-voice] session created, attempt:", tok.attempt, "tools attached:", !!tok.toolsAttached);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = audioElRef.current ?? new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          ctxRef.current = ctx;
          const source = ctx.createMediaStreamSource(e.streams[0]);
          const an = ctx.createAnalyser();
          an.fftSize = 256;
          source.connect(an);
          analyserRef.current = an;
          const data = new Uint8Array(an.frequencyBinCount);
          const tick = () => {
            an.getByteFrequencyData(data);
            const avg = data.reduce((s, v) => s + v, 0) / data.length / 255;
            setAudioLevel(avg);
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        } catch {}
      };

      stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => { try { handleEvent(JSON.parse(e.data)); } catch {} };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // OpenAI has two WebRTC connection endpoints depending on the API
      // generation used to mint the token. /v1/realtime/calls is the new one
      // (paired with /client_secrets + gpt-realtime). /v1/realtime?model=...
      // is the legacy one (paired with /sessions + gpt-4o-realtime-preview-*).
      // We try the one that matches the attempt that succeeded server-side,
      // fall back to the other if it 400s.
      async function tryConnect(url: string) {
        return fetch(url, {
          method: "POST",
          body:   offer.sdp,
          headers: { "Authorization": `Bearer ${tok.client_secret}`, "Content-Type": "application/sdp" },
        });
      }
      const NEW_URL    = `https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(tok.model)}`;
      const LEGACY_URL = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(tok.model)}`;
      // Pick primary based on which API path the server used
      const wasNew = (tok.attempt ?? "").startsWith("new");
      const primary  = wasNew ? NEW_URL : LEGACY_URL;
      const fallback = wasNew ? LEGACY_URL : NEW_URL;

      let sdpRes = await tryConnect(primary);
      let firstErr = "";
      if (!sdpRes.ok) {
        firstErr = await sdpRes.text();
        console.warn("SDP primary failed:", sdpRes.status, firstErr.slice(0, 300));
        sdpRes = await tryConnect(fallback);
      }
      if (!sdpRes.ok) {
        const secondErr = await sdpRes.text();
        throw new Error(`SDP exchange failed (${sdpRes.status}). Primary: ${firstErr.slice(0, 200) || "ok"}. Fallback: ${secondErr.slice(0, 200)}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setPhase("listening");

      // ── Idle + max-session watchdog ──
      sessionStartRef.current = Date.now();
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current) window.clearInterval(idleTimerRef.current);
      idleTimerRef.current = window.setInterval(() => {
        const now = Date.now();
        const idle = now - lastActivityRef.current;
        const total = now - sessionStartRef.current;
        if (idle >= IDLE_KILL_MS) {
          console.warn("[alfred-voice] idle kill — disconnecting");
          setError("Disconnected — idle for 5 min");
          setPhase("error");
          teardown();
          try { window.dispatchEvent(new Event("alfred:realtime-end")); } catch {}
        } else if (total >= MAX_SESSION_MS) {
          console.warn("[alfred-voice] max session — disconnecting");
          setError("Disconnected — 1 hour session cap reached");
          setPhase("error");
          teardown();
          try { window.dispatchEvent(new Event("alfred:realtime-end")); } catch {}
        }
      }, 20_000);
    } catch (err: any) {
      console.error("Realtime connect failed:", err);
      // Translate common errors into actionable messages
      let msg = err?.message ?? "Connection failed";
      const name = err?.name ?? "";
      if (name === "NotAllowedError" || /permission denied/i.test(msg)) {
        msg = `Microphone blocked. Click the 🔒/🌐 icon left of the URL → Site settings → Microphone → Allow → reload. On iPhone: Settings → Safari → Microphone → set this site to Allow.`;
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone found on this device.";
      } else if (name === "NotReadableError") {
        msg = "Microphone is in use by another app. Close it and try again.";
      } else if (name === "SecurityError") {
        msg = "Browser blocked mic — this needs an HTTPS connection (it should already be).";
      }
      setError(msg);
      setPhase("error");
      teardown();
      try { window.dispatchEvent(new Event("alfred:realtime-end")); } catch {}
    }
  }, [teardown]);

  const disconnect = useCallback(() => {
    teardown();
    setPhase("idle");
    setError(null);
    // Allow wake-word listener to resume
    try { window.dispatchEvent(new Event("alfred:realtime-end")); } catch {}
  }, [teardown]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      streamRef.current?.getAudioTracks().forEach(t => { t.enabled = !next; });
      return next;
    });
  }, []);

  // Auto-cleanup on unmount
  useEffect(() => () => teardown(), [teardown]);

  return { phase, error, muted, audioLevel, partialUser, partialAlfred, toolsAttached, attempt, connect, disconnect, toggleMute };
}
