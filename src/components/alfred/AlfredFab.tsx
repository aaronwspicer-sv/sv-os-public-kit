"use client";
// Floating ✦ button bottom-right that opens Alfred's chat panel.
import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, X, Send, RefreshCcw, Wrench, ChevronDown, Image as ImageIcon, Trash2, Mic, MicOff, Square, Volume2, VolumeX, Headphones, Radio, PhoneOff, History, Pencil, Check } from "lucide-react";
import { useRealtime } from "@/lib/alfred/useRealtime";
import { useRouter } from "next/navigation";
import { config } from "@/config";
import { cannedAlfredAnswer, DEMO_ALFRED_PROMPTS } from "@/lib/demoAlfred";

// Voice settings
const VOICE_KEY  = "alfred_voice";        // OpenAI TTS voice id
const TTS_KEY    = "alfred_tts_enabled";  // bool — auto-speak responses
const CONVO_KEY  = "alfred_convo_mode";   // bool — auto-mic after response
// Voices available in BOTH TTS (/api/alfred/tts) and Realtime API.
// Tagged with rough gender impression so you can pick a Jarvis-style male.
const VOICES: { id: string; label: string }[] = [
  { id: "ash",     label: "Ash · male · deeper, steady (most Jarvis)" },
  { id: "echo",    label: "Echo · male · grounded, calm" },
  { id: "ballad",  label: "Ballad · male · dramatic" },
  { id: "verse",   label: "Verse · male · dynamic" },
  { id: "sage",    label: "Sage · male-leaning · calm" },
  { id: "alloy",   label: "Alloy · neutral" },
  { id: "coral",   label: "Coral · female · friendly" },
  { id: "shimmer", label: "Shimmer · female · bright" },
  { id: "nova",    label: "Nova · female · warm" },
];
const DEFAULT_VOICE = "ash";

function loadBool(key: string, def = false): boolean {
  if (typeof window === "undefined") return def;
  try { return localStorage.getItem(key) === "1"; } catch { return def; }
}
function saveBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? "1" : "0"); } catch {}
}
function loadStr(key: string, def: string): string {
  if (typeof window === "undefined") return def;
  try { return localStorage.getItem(key) ?? def; } catch { return def; }
}

const MODEL_KEY = "alfred_model";
const MODEL_OPTIONS: { id: string; label: string; sublabel: string }[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", sublabel: "Fast · everyday default" },
  { id: "gpt-4o",      label: "GPT-4o",      sublabel: "Smartest · slower · more $" },
  { id: "gpt-4.1-mini",label: "GPT-4.1 mini",sublabel: "Cheap · long context" },
  { id: "o4-mini",     label: "o4-mini",     sublabel: "Reasoning · thinks step-by-step" },
];
function loadModel(): string {
  if (typeof window === "undefined") return "gpt-4o-mini";
  try { return localStorage.getItem(MODEL_KEY) ?? "gpt-4o-mini"; } catch { return "gpt-4o-mini"; }
}

// Slash commands expand a short trigger into a rich analyst prompt.
// Auto-suggested model bump: analyst stuff goes better on full gpt-4o.
const SLASH_COMMANDS: { id: string; description: string; expand: () => string; preferredModel?: string }[] = [
  {
    id: "/review",
    description: "Run a weekly review of the last 7 days",
    preferredModel: "gpt-4o",
    expand: () => "Run my weekly review. Pull the last 7 days vs the prior 7 days, compare. Headline first. Then the numbers that prove it. Then patterns you noticed. Then ONE concrete recommendation. No filler.",
  },
  {
    id: "/compare",
    description: "Compare this week to last (or pass dates)",
    preferredModel: "gpt-4o",
    expand: () => "Compare this week (last 7 days through today) to the previous 7 days. Show deltas for hours, habit %, video output, content shipped. What got better, what slipped, what should I change?",
  },
  {
    id: "/month",
    description: "Compare this month to last month",
    preferredModel: "gpt-4o",
    expand: () => "Compare this month so far to last month at the same point. Use get_period_summary twice. Tell me whether I'm tracking up or down on every habit and on hours. Give me the headline + the verdict + ONE move.",
  },
  {
    id: "/patterns",
    description: "Find behavioral patterns in last 30 days",
    preferredModel: "gpt-4o",
    expand: () => "Look at my last 30 days of logs (use get_recent_logs days:30). Find behavioral patterns. Especially: which habits cluster together? Does NF correlate with workout? Do high-hour days follow journaling? Be specific with day counts and percentages. Don't make stuff up — only call out what the data shows.",
  },
  {
    id: "/leaks",
    description: "Where am I leaking time, money, momentum",
    preferredModel: "gpt-4o",
    expand: () => "Where am I leaking? Pull recent finance summary, unreviewed transactions, content pipeline counts, and the last 14 days of logs. Tell me the top 3 leaks — time, money, or momentum. Be brutal but specific.",
  },
  {
    id: "/wins",
    description: "Surface top wins from the last 14 days",
    expand: () => "Pull the last 14 days. What are my top wins — concrete moves I made that I should remember? No fluff, real receipts. End with 'what to repeat'.",
  },
  {
    id: "/records",
    description: "Show my personal records",
    expand: () => "What are my personal records? Use get_personal_records. Tell me where I'm close to setting new ones in the current period.",
  },
  // ─── AUTONOMOUS / COACH (T5) ───
  {
    id: "/coach",
    description: "Run the Alfred coach review (Sunday-style)",
    preferredModel: "gpt-4o",
    expand: () => `Run a coach review of where I am right now. Pull get_snapshot + get_recent_logs(days:7) + compare_periods (this week vs last). Then write a tight 4-section review in MY voice:

1) HEADLINE — one-line verdict
2) WHAT WORKED — specific wins with numbers
3) WHAT SLIPPED — honest read, no hedging
4) THE ONE MOVE for next week — concrete, bandwidth-aware, school-first

Voice rules locked. After you finish writing, call remember to save the review (importance: 7, tag: weekly-review) so future-you has it as context.`,
  },
  // ─── RESEARCH (T4) ───
  {
    id: "/research",
    description: "Deep web research on a topic + synthesize for SV",
    preferredModel: "gpt-4o",
    expand: () => `Deep research on the topic I'm about to give you. Run 1–3 focused web_search calls (don't shotgun). For any source that matters, fetch_url to read it properly. Then synthesize:

1. The 3 most important things I should know
2. Concrete numbers / dates / names (cite by source name briefly, not URLs everywhere)
3. What this MEANS for me specifically — my channel, my decision, my bandwidth
4. ONE concrete move to make (or "nothing to do here")

No filler. No "this is a fascinating topic." Just signal.`,
  },
  {
    id: "/news",
    description: "Recent news scan on a topic with SV angle",
    preferredModel: "gpt-4o",
    expand: () => `Scan recent news on the topic I'm about to give you. Use web_search with depth:'basic' and a query that targets the last few days. Then:

- The 3 most important headlines (one-liner each, attributed)
- The under-the-radar story most people are missing
- The angle for an SV video — IF there's a genuine fit for one of the 4 pillars (Process/Proof/Journey/Lessons). Be honest if there isn't.`,
  },
  {
    id: "/dealcheck",
    description: "Vet a brand deal / sponsorship email — paste it after",
    preferredModel: "gpt-4o",
    expand: () => `Vet the brand-deal email I'm about to paste. Work through it systematically:

1. WHO — what company. If unfamiliar, web_search them and fetch_url their site. Confirm they're real.
2. WHAT — the offer (cash? product? equity? "exposure"?). Surface anything vague.
3. DELIVERABLES — what they want from me. Time cost? Usage rights? Exclusivity? Whitelisting?
4. RED FLAGS — fake urgency, ownership grabs, "we don't have budget", off-brand fit, missing legal name, no contract mentioned, sketchy email domain.
5. VALUE CHECK — is the offer fair for my current scale? Reference my pricing floor.
6. VERDICT — TAKE / PUSH BACK / PASS. One sentence why.
7. DRAFT REPLY — if take/push-back, write a reply in my voice (direct, specific, no hustle-bro). If pass, skip this.

Be brutal. The default is pass.`,
  },
  // ─── CREATIVE / VISION ───
  {
    id: "/thumb",
    description: "Critique the attached thumbnail (paste/upload image first)",
    preferredModel: "gpt-4o",
    expand: () => `Critique the attached thumbnail through a sharp, high-retention YouTube lens.

Score 1–10 on each:
1. STOPPING POWER — would I scroll past it?
2. CLARITY — can I tell the topic in <1 second?
3. EMOTION — what feeling does the face/composition convey? Does it match the title's promise?
4. CONTRAST — does the text + subject pop on mobile?
5. VOICE FIT — does this feel like SV or generic YouTube?

Then give 3 concrete fixes (specific — "move the text to top-left and shrink 20%", not "improve composition").

Be brutal but useful. No vibes-based praise.`,
  },
  {
    id: "/voice",
    description: "Rewrite text in my voice",
    expand: () => `Take the text I just pasted (or am about to paste) and rewrite it in my voice. Apply the voice rules:
- Kill hustle-bro and generic motivation
- Add specifics + numbers where vague claims live
- Short sentences with room to breathe
- First person, present tense
- Never start with "I" if it's a caption/hook
- Sounds like a smart 17-year-old actually doing it

Output: the rewrite, then 2 alt versions for A/B.`,
  },
  // ─── SV CONTENT PIPELINE ───
  {
    id: "/status",
    description: "Pipeline · show all in-progress videos",
    expand: () => "Run pipeline_status. Show me what's in flight, what stage each is on, and what's stalled. If nothing's in progress, suggest one move to push the pipeline forward.",
  },
  {
    id: "/idea",
    description: "Pipeline · Stage 1 — start a new video",
    preferredModel: "gpt-4o",
    expand: () => `STAGE 1 — IDEATION. Workshop a new SV video with me from scratch.

Process:
1. Ask me: Long form (YouTube) or Standalone short (TikTok/Reels)?
2. Ask: what's the seed? (a moment, a result, a question, a build) — or offer 3 directional pulls based on my recent log entries + content pipeline if I have nothing.
3. Once we have a seed, push back hard: is this Build+Result+Breakdown material? Which pillar (Process/Proof/Journey/Lessons)? Who specifically is this FOR (the young person who feels different/behind)?
4. Refine into a concept brief with: hook angle, one-line premise, the lesson, the proof, the build.
5. When I confirm, call pipeline_create with the concept_brief as full markdown.
6. End with the handoff: "✓ Concept locked. Type 'package it' to move to Stage 2."

Use bandwidth filter — flag if this video is too ambitious for Phase 1. Don't hype if the idea is mid.`,
  },
  {
    id: "/package",
    description: "Pipeline · Stage 2 — packaging (titles, thumb concept, description)",
    preferredModel: "gpt-4o",
    expand: () => `STAGE 2 — PACKAGING. Load the latest in-progress video at Stage 1.

Process:
1. pipeline_status, then pipeline_get on the most recent Stage-1 video.
2. BEFORE generating titles, call youtube_search on 2-3 relevant query variations (the topic, the keyword angle, the result) to see what's working in the space. Look at top view counts and what hooks the leaders are using. If YOUTUBE_API_KEY isn't set, skip this step silently.
3. Generate 5 title options. Each must:
   - Be in MY voice (specifics, numbers, no hustle-bro, no generic motivation)
   - Make the hook obvious in <60 chars
   - Avoid clickbait that overpromises — receipt-friendly
4. Generate 1 hero thumbnail concept (composition + text + emotion).
5. Generate a 2–3 sentence description for the YouTube box.
6. Generate 5 tag suggestions.
7. Ask me to pick a final title. Confirm it.
8. Call pipeline_save_stage(stage:2, content:<full packaging markdown>, final_title:<confirmed>).
9. End with the handoff: "✓ Packaging done. Final title: [X]. Type 'make the thumbnail' for Stage 3 or 'script it' to skip to Stage 4."`,
  },
  {
    id: "/script",
    description: "Pipeline · Stage 4 — write the script in my voice",
    preferredModel: "gpt-4o",
    expand: () => `STAGE 4 — SCRIPT. Load the in-progress video's Stage 1 + Stage 2 content first.

Structure (Build + Result + Breakdown):
1. HOOK (first 15 sec) — receipt-led, specific, no setup
2. PROMISE — what they'll get if they stay
3. BUILD — the process, the decisions, the obstacles, the work (the meat)
4. RESULT — the receipts, numbers, what actually happened
5. BREAKDOWN — what I took from it, what to repeat, what to skip
6. CTA + outro

Voice rules (enforced):
- Short sentences. Room to breathe.
- First person, present tense.
- Specifics + numbers everywhere
- No hustle-bro. No generic motivation. No "I" at caption starts.
- Sounds like a smart 17-year-old actually doing it.
- Surface ONE of the three anchor lines if it lands naturally.

When draft is ready, ask for tweaks. When I confirm, call pipeline_save_stage(stage:4, content:<full script>).
Handoff: "✓ Script done. Go film it. Come back and type 'filmed' when you have the footage."`,
  },
  {
    id: "/editbrief",
    description: "Pipeline · Stage 6 — generate edit brief",
    preferredModel: "gpt-4o",
    expand: () => `STAGE 6 — EDIT BRIEF. Load the in-progress video's script + footage path.

Build a structured Edit Brief with:
- Hook timing (exact seconds for cold open, first cut)
- Key moments (timestamp cues mapped to script beats)
- B-roll notes (what to source, when it appears)
- Music vibe (energy, genre, reference vibe — not licensed songs)
- Pacing notes (where to tighten, where to breathe)
- CTA placement
- Thumbnail pull-frame (best moment to match the thumbnail)
- 3-5 hard-cut flags (dead zones, sections to drop)

When ready, call pipeline_save_stage(stage:6, content:<full edit brief>). Then output the Video Editing Studio handoff prompt verbatim with the bracketed paths filled in.`,
  },
  {
    id: "/repurpose",
    description: "Pipeline · Stage 7 — extract 2-3 short-form clips",
    preferredModel: "gpt-4o",
    expand: () => `STAGE 7 — REPURPOSE. Load the in-progress Editing-stage video.

Extract 2-3 short-form clips. For each:
- Hook caption (under 80 chars, in voice, no leading "I")
- Suggested timestamp window from the long form
- Why this moment is short-form-worthy (the tension/proof/insight)
- Platform recommendation (all 3 by default: TikTok / IG Reels / YT Shorts)

When confirmed, call pipeline_save_stage(stage:7, content:<full repurpose plan>).
Handoff: "✓ Pipeline complete. Type 'new idea' to start the next one."`,
  },
  {
    id: "/continue",
    description: "Pipeline · resume where I left off",
    expand: () => "Run pipeline_status. If there's exactly one in-progress video, jump straight into its current stage with the appropriate stage instructions. If multiple, list them and ask which to resume.",
  },
];

interface ToolRun { name: string; status: "running" | "done" | "failed"; ms?: number }
interface Msg {
  role: "user" | "assistant";
  content: string;
  tools?: ToolRun[];
  phase?: "thinking" | "tool_running" | "responding" | "done";
  imageThumbs?: string[];   // for user messages with attached images
}

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_IMAGES = 4;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const TOOL_LABEL: Record<string, string> = {
  get_snapshot:               "Reading OS state",
  get_log_by_date:            "Fetching log entry",
  get_recent_logs:            "Reading recent logs",
  get_todos:                  "Reading todos",
  get_finances_summary:       "Reading finances",
  get_unreviewed_transactions:"Reading transactions",
  get_account_balances:       "Reading account balances",
  get_video_pipeline:         "Reading content pipeline",
  get_streaks:                "Reading streaks",
  get_goals:                  "Reading goals",
  get_audit_log:              "Reading audit log",
  get_today_calendar:         "Reading today's calendar",
  get_upcoming_calendar:      "Reading upcoming calendar",
  navigate_to:                "Routing the browser",
  update_today_log:           "Writing today's log",
  add_todo:                   "Adding a todo",
  complete_todo:              "Completing a todo",
  delete_todo:                "Deleting a todo",
  confirm_transaction:        "Categorizing transaction",
  save_note:                  "Saving a note",
  list_notes:                 "Reading saved notes",
  get_period_summary:         "Summarizing a period",
  compare_periods:            "Comparing two periods",
  get_personal_records:       "Reading personal bests",
  // Memory
  remember:                   "Saving to long-term memory",
  search_memory:              "Searching past sessions",
  list_memories:              "Listing all memories",
  forget_memory:              "Deleting a memory",
  // Pipeline
  pipeline_status:            "Checking content pipeline",
  pipeline_get:               "Loading video state",
  pipeline_create:            "Creating new video (Stage 1)",
  pipeline_save_stage:        "Saving pipeline stage",
  pipeline_set_meta:          "Updating video metadata",
  // Research
  youtube_search:             "Searching YouTube",
  youtube_channel_lookup:     "Looking up channel",
  web_search:                 "Searching the web",
  fetch_url:                  "Reading the page",
};

export function AlfredFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [convTitle, setConvTitle] = useState<string | null>(null);

  // Threads panel
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threads, setThreads] = useState<{ id: string; title: string | null; updated_at: string; preview: string | null }[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [model, setModelState] = useState<string>("gpt-4o-mini");
  const [modelOpen, setModelOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  // Voice
  const [recording, setRecording]   = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsOn, setTtsOn]           = useState(false);
  const [convoMode, setConvoMode]   = useState(false); // auto-mic after each response
  const [voice, setVoice]           = useState<string>(DEFAULT_VOICE);
  const [speaking, setSpeaking]     = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  // Voice-live (Realtime) state lives on the SAME messages array — transcripts
  // just append as user/assistant messages. Persisted to DB on disconnect.
  const voicePersistedTurnsRef = useRef<{ role: "user"|"assistant"; content: string }[]>([]);
  const router = useRouter();

  const realtime = useRealtime({
    onNavigate: (url) => {
      // SPA-style navigation keeps WebRTC alive across the route change
      try { router.push(url); } catch { window.location.href = url; }
    },
    onUserTurn: (text) => {
      voicePersistedTurnsRef.current.push({ role: "user", content: text });
      setMessages(prev => [...prev, { role: "user", content: text }]);
    },
    onAlfredTurn: (text) => {
      voicePersistedTurnsRef.current.push({ role: "assistant", content: text });
      setMessages(prev => {
        // If we've been streaming partials into a placeholder, finalize that
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.phase === "responding") {
          const copy = [...prev];
          copy[copy.length - 1] = { ...last, content: text, phase: "done" };
          return copy;
        }
        return [...prev, { role: "assistant", content: text, phase: "done" }];
      });
    },
    onToolCall: (name, result) => {
      const ok = !(result && typeof result === "object" && "error" in result);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        const tools = (last?.role === "assistant" ? (last.tools ?? []) : []).concat({
          name,
          status: ok ? "done" : "failed",
        });
        if (last?.role === "assistant") {
          const copy = [...prev];
          copy[copy.length - 1] = { ...last, tools };
          return copy;
        }
        return [...prev, { role: "assistant", content: "", tools, phase: "tool_running" }];
      });
    },
    onAlfredDelta: (_delta, full) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.phase === "responding") {
          const copy = [...prev];
          copy[copy.length - 1] = { ...last, content: full };
          return copy;
        }
        // Otherwise spin up a placeholder
        return [...prev, { role: "assistant", content: full, phase: "responding", tools: [] }];
      });
    },
  });

  // Show the banner whenever voice is not in pure idle — including error,
  // so the user can SEE what went wrong instead of it silently vanishing.
  const voiceLive = realtime.phase !== "idle";
  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const audioRef     = useRef<HTMLAudioElement | null>(null);
  // The last assistant text we spoke — used to avoid double-speaking
  const spokenRef    = useRef<string>("");
  // Whether the NEXT 'done' event should auto-trigger recording (convo mode)
  const autoListenRef = useRef(false);

  useEffect(() => {
    setTtsOn(loadBool(TTS_KEY));
    setConvoMode(loadBool(CONVO_KEY));
    setVoice(loadStr(VOICE_KEY, DEFAULT_VOICE));
  }, []);

  // ── Voice: speak text via TTS ──────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      setSpeaking(true);
      const r = await fetch("/api/alfred/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!r.ok) { setSpeaking(false); return; }
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const el   = audioRef.current ?? new Audio();
      audioRef.current = el;
      el.src = url;
      el.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
        // Convo mode: auto-arm the mic right after Alfred finishes
        if (autoListenRef.current) {
          autoListenRef.current = false;
          setTimeout(() => { startRecording().catch(() => {}); }, 250);
        }
      };
      el.onerror = () => setSpeaking(false);
      await el.play().catch(() => setSpeaking(false));
    } catch {
      setSpeaking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice]);

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setSpeaking(false);
    autoListenRef.current = false;
  }, []);

  // ── Voice: record + transcribe ─────────────────────────────
  const startRecording = useCallback(async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = mr;
      recChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mime || "audio/webm" });
        recChunksRef.current = [];
        if (blob.size < 1000) { setRecording(false); return; } // empty/click-blip
        setRecording(false);
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "speech.webm");
          const r = await fetch("/api/alfred/transcribe", { method: "POST", body: fd });
          const d = await r.json().catch(() => ({}));
          if (r.ok && typeof d.text === "string" && d.text.trim()) {
            setInput(d.text.trim());
            // Convo mode = hands-free → auto-send. Otherwise let user review.
            if (convoMode) setTimeout(() => send(), 60);
            else setTimeout(() => inputRef.current?.focus(), 30);
          }
        } finally {
          setTranscribing(false);
        }
      };
      mr.start();
      setRecording(true);
    } catch (err: any) {
      console.error("mic failed:", err?.message);
      setRecording(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const addImages = useCallback(async (files: File[]) => {
    setImageError(null);
    const room = MAX_IMAGES - pendingImages.length;
    const usable = files.slice(0, room);
    const next: string[] = [];
    for (const f of usable) {
      if (!f.type.startsWith("image/"))    { setImageError("Only image files"); continue; }
      if (f.size > MAX_IMAGE_BYTES)        { setImageError("Image must be under 5MB"); continue; }
      try { next.push(await fileToDataUrl(f)); } catch {}
    }
    if (next.length > 0) setPendingImages(prev => [...prev, ...next]);
  }, [pendingImages.length]);

  useEffect(() => { setModelState(loadModel()); }, []);
  function setModel(id: string) {
    setModelState(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch {}
    setModelOpen(false);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Keyboard shortcuts:
  //   Cmd/Ctrl + J          → toggle Alfred panel
  //   Cmd/Ctrl + Shift + A  → open panel + start/stop recording (voice mode)
  // Persist accumulated voice turns to DB. Called on disconnect.
  const persistVoice = useCallback(async () => {
    const turns = voicePersistedTurnsRef.current;
    if (turns.length === 0) return;
    voicePersistedTurnsRef.current = [];
    try {
      const r = await fetch("/api/alfred/persist-voice-turns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, turns }),
      });
      const d = await r.json().catch(() => ({}));
      if (d?.conversationId && !convId) setConvId(d.conversationId);
    } catch {}
  }, [convId]);

  const toggleVoice = useCallback(async () => {
    if (voiceLive) {
      realtime.disconnect();
      await persistVoice();
    } else {
      await realtime.connect(voice);
    }
  }, [voiceLive, realtime, persistVoice, voice]);

  // Wake-word listener fires this event — open + voice + (optional) follow-on text
  useEffect(() => {
    const onWake = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      setOpen(true);
      // If user spoke a follow-on phrase ("Hey Alfred, what's my streak?"),
      // we just open voice — Realtime will pick up their continuing speech.
      // The 'follow' chunk is captured but discarded for now (different mic source).
      setTimeout(() => {
        if (!voiceLive) toggleVoice();
      }, 100);
      void detail; // future: prefill input if they typed before triggering
    };
    window.addEventListener("alfred:wake", onWake);
    return () => window.removeEventListener("alfred:wake", onWake);
  }, [voiceLive, toggleVoice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘⇧J — toggle voice mode in the open chat panel
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "j" || e.key === "J" || e.code === "KeyJ")) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => { toggleVoice(); }, 80);
        return;
      }
      // ⌘⇧A — push-to-talk transcription in chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "a" || e.key === "A" || e.code === "KeyA")) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => {
          if (recording) stopRecording();
          else startRecording().catch(() => {});
        }, 100);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, startRecording, stopRecording, toggleVoice]);

  // When the last assistant message finishes streaming (phase=done) and
  // TTS is on, speak it. Convo mode arms the mic afterward.
  useEffect(() => {
    if (!ttsOn) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || last.phase !== "done") return;
    if (!last.content || last.content === spokenRef.current) return;
    spokenRef.current = last.content;
    if (convoMode) autoListenRef.current = true;
    speak(last.content);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, ttsOn, convoMode]);

  const send = useCallback(async (override?: string) => {
    let text = (typeof override === "string" ? override : input).trim();
    // Allow image-only sends with a placeholder prompt
    if (!text && pendingImages.length > 0) text = "Look at this and tell me what you think.";
    if (!text || busy) return;

    // Slash command expansion
    let modelOverride: string | null = null;
    if (text.startsWith("/")) {
      const cmd = SLASH_COMMANDS.find(c => c.id === text.split(" ")[0]);
      if (cmd) {
        text = cmd.expand();
        if (cmd.preferredModel) modelOverride = cmd.preferredModel;
      }
    }
    const useModel = modelOverride ?? model;

    setInput("");
    setBusy(true);

    const imagesForTurn = [...pendingImages];
    setPendingImages([]);

    const newUserMsg: Msg = { role: "user", content: text, imageThumbs: imagesForTurn };
    const newAssistantMsg: Msg = { role: "assistant", content: "", tools: [], phase: "thinking" };
    setMessages(prev => [...prev, newUserMsg, newAssistantMsg]);

    // Public demo: no API. Answer from the canned script after a short beat.
    if (config.isPublicDemo) {
      const answer = cannedAlfredAnswer(text);
      window.setTimeout(() => {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: answer, phase: "done" };
          return copy;
        });
        setBusy(false);
      }, 500);
      return;
    }

    try {
      const res = await fetch("/api/alfred/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId, model: useModel, images: imagesForTurn }),
      });
      if (!res.ok || !res.body) {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "Couldn't reach Alfred. Try again." };
          return copy;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.replace(/^data:\s?/, "").trim();
          if (!line) continue;
          let payload: any;
          try { payload = JSON.parse(line); } catch { continue; }
          if (payload.kind === "meta" && payload.conversationId) {
            setConvId(payload.conversationId);
            if (!convId) setConvTitle(String(text).slice(0, 60));
          } else if (payload.kind === "phase") {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") copy[copy.length - 1] = { ...last, phase: payload.data };
              return copy;
            });
          } else if (payload.kind === "tool_start") {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  tools: [...(last.tools ?? []), { name: payload.data.name, status: "running" }],
                };
              }
              return copy;
            });
          } else if (payload.kind === "tool_end") {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                const tools = (last.tools ?? []).map(t =>
                  t.name === payload.data.name && t.status === "running"
                    ? { ...t, status: payload.data.ok ? "done" as const : "failed" as const, ms: payload.data.ms }
                    : t,
                );
                copy[copy.length - 1] = { ...last, tools };
              }
              return copy;
            });
          } else if (payload.kind === "text") {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = { ...last, content: last.content + payload.data, phase: "responding" };
              }
              return copy;
            });
          } else if (payload.kind === "done") {
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") copy[copy.length - 1] = { ...last, phase: "done" };
              return copy;
            });
          } else if (payload.kind === "error") {
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: `Error: ${payload.data}` };
              return copy;
            });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [input, busy, convId, model, pendingImages]);

  function newChat() {
    setMessages([]);
    setConvId(null);
    setConvTitle(null);
    setThreadsOpen(false);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function openThreads() {
    setThreadsOpen(o => !o);
    if (threadsOpen) return;
    setThreadsLoading(true);
    try {
      const d = await fetch("/api/alfred/conversations").then(r => r.json());
      setThreads(d.conversations ?? []);
    } catch {}
    finally { setThreadsLoading(false); }
  }

  async function loadThread(id: string, title: string | null) {
    setThreadsOpen(false);
    setMessages([]);
    setConvId(id);
    setConvTitle(title);
    try {
      const d = await fetch(`/api/alfred/conversations/${id}/messages`).then(r => r.json());
      const loaded: Msg[] = (d.messages ?? [])
        .filter((m: any) => m.role === "user" || m.role === "assistant")
        .map((m: any) => ({ role: m.role, content: m.content ?? "" }));
      setMessages(loaded);
    } catch {}
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function saveRename(id: string) {
    const title = renameValue.trim();
    if (!title) { setRenamingId(null); return; }
    await fetch(`/api/alfred/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
    setThreads(prev => prev.map(t => t.id === id ? { ...t, title } : t));
    if (convId === id) setConvTitle(title);
    setRenamingId(null);
  }

  async function deleteThread(id: string) {
    await fetch(`/api/alfred/conversations/${id}`, { method: "DELETE" }).catch(() => {});
    setThreads(prev => prev.filter(t => t.id !== id));
    if (convId === id) newChat();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 md:bottom-6 right-5 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-[0_10px_30px_rgba(29,155,240,0.35),inset_0_1px_0_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all"
        style={{ background: "linear-gradient(135deg, #1d9bf0 0%, #a78bfa 100%)" }}
        aria-label="Open Alfred"
      >
        <Sparkles size={20} className="text-black" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-end pointer-events-none">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full md:w-[440px] md:m-6 max-h-[88vh] md:max-h-[80vh] md:rounded-[20px] surface-solid flex flex-col pointer-events-auto"
               style={{ animation: "fade-up 0.3s var(--ease-glide) both" }}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1d9bf0, #a78bfa)" }}>
                  <Sparkles size={14} className="text-black" />
                </div>
                <div>
                  <p className="text-[13px] font-700 text-text-1">Alfred</p>
                  <p className="text-[10px] text-text-3">SV-GPT · second brain</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Model picker */}
                <div className="relative">
                  <button
                    onClick={() => setModelOpen(o => !o)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-[10px] font-600 text-text-2"
                    title="Choose model"
                  >
                    {MODEL_OPTIONS.find(m => m.id === model)?.label ?? model}
                    <ChevronDown size={11} />
                  </button>
                  {modelOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-[240px] surface-solid rounded-[12px] p-1">
                        {MODEL_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => setModel(opt.id)}
                            className={`w-full text-left px-3 py-2 rounded-[8px] flex flex-col gap-0.5 transition-all ${
                              model === opt.id
                                ? "bg-accent-dim border border-[rgba(29,155,240,0.32)]"
                                : "hover:bg-[rgba(255,255,255,0.04)] border border-transparent"
                            }`}
                          >
                            <span className="text-[12px] font-600 text-text-1">
                              {opt.label}
                              {model === opt.id && <span className="text-accent ml-1">✓</span>}
                            </span>
                            <span className="text-[10px] text-text-3">{opt.sublabel}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {/* Live voice (Realtime) — same chat thread */}
                <button
                  onClick={toggleVoice}
                  className={`p-1.5 rounded-md transition-all ${
                    voiceLive
                      ? "bg-[rgba(167,139,250,0.18)] text-[#a78bfa]"
                      : "hover:bg-[rgba(255,255,255,0.06)] text-text-3"
                  }`}
                  title={voiceLive ? "End live voice (⌘⇧J)" : "Start live voice — talk to Alfred (⌘⇧J)"}
                >
                  <Radio size={14} className={voiceLive ? "text-[#a78bfa] animate-pulse" : "text-[#a78bfa]"} />
                </button>
                {/* TTS toggle */}
                <button
                  onClick={() => {
                    const next = !ttsOn;
                    setTtsOn(next); saveBool(TTS_KEY, next);
                    if (!next) stopSpeaking();
                  }}
                  className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-text-3"
                  title={ttsOn ? "Speech on" : "Speech off"}
                >
                  {ttsOn ? <Volume2 size={14} className="text-accent" /> : <VolumeX size={14} />}
                </button>
                {/* Convo (auto-mic) toggle */}
                <button
                  onClick={() => {
                    const next = !convoMode;
                    setConvoMode(next); saveBool(CONVO_KEY, next);
                    if (!next) autoListenRef.current = false;
                  }}
                  className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-text-3"
                  title={convoMode ? "Conversation mode on — auto-mic after Alfred speaks" : "Tap once for hands-free conversation"}
                >
                  <Headphones size={14} className={convoMode ? "text-[#a78bfa]" : ""} />
                </button>
                {/* Voice picker — used by BOTH TTS and Realtime */}
                <div className="relative">
                  <button onClick={() => setVoiceMenuOpen(o => !o)} className="px-2 py-1 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-[10px] font-600 text-text-2" title="Pick Alfred's voice (for TTS + live voice)">
                    {voice}<ChevronDown size={10} className="inline ml-0.5" />
                  </button>
                  {voiceMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setVoiceMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 z-20 w-[280px] surface-solid rounded-[12px] p-1">
                        <div className="px-3 py-1.5 text-[9px] uppercase tracking-[0.14em] text-text-3 font-600">Voice (TTS + Live)</div>
                        {VOICES.map(v => (
                          <button
                            key={v.id}
                            onClick={async () => {
                              setVoice(v.id);
                              try { localStorage.setItem(VOICE_KEY, v.id); } catch {}
                              setVoiceMenuOpen(false);
                              // If a live voice session is active, reconnect with the new voice
                              if (voiceLive) {
                                realtime.disconnect();
                                await persistVoice();
                                setTimeout(() => realtime.connect(v.id), 350);
                              }
                            }}
                            className={`w-full text-left px-3 py-2 rounded-[8px] text-[12px] ${voice === v.id ? "bg-accent-dim text-accent" : "hover:bg-[rgba(255,255,255,0.04)] text-text-1"}`}
                          >{v.label}</button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <button onClick={openThreads} className={`p-1.5 rounded-md transition-all ${threadsOpen ? "bg-accent-dim text-accent" : "hover:bg-[rgba(255,255,255,0.06)] text-text-3"}`} title="Conversation history">
                  <History size={14} />
                </button>
                <button onClick={newChat} className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-text-3" title="New chat">
                  <RefreshCcw size={14} />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-[rgba(255,255,255,0.06)] text-text-3" title="Close">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Active thread title */}
            {convTitle && !threadsOpen && (
              <div className="px-4 py-1.5 border-b border-border-dim flex items-center gap-2">
                <span className="text-[11px] text-text-3 truncate flex-1">{convTitle}</span>
                <button
                  onClick={() => { setRenamingId(convId); setRenameValue(convTitle ?? ""); setThreadsOpen(true); openThreads(); }}
                  className="p-1 rounded hover:bg-[rgba(255,255,255,0.06)] text-text-3 flex-shrink-0"
                  title="Rename"
                ><Pencil size={10} /></button>
              </div>
            )}

            {/* Threads panel */}
            {threadsOpen && (
              <div className="border-b border-border-dim max-h-[280px] overflow-y-auto">
                {threadsLoading ? (
                  <div className="px-4 py-6 text-center text-[12px] text-text-3">Loading…</div>
                ) : threads.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[12px] text-text-3">No conversations yet</div>
                ) : (
                  <div className="flex flex-col p-2 gap-0.5">
                    {threads.map(t => (
                      <div key={t.id} className={`group flex items-center gap-2 px-3 py-2 rounded-[10px] cursor-pointer transition-all ${t.id === convId ? "bg-accent-dim border border-[rgba(29,155,240,0.2)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}>
                        {renamingId === t.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveRename(t.id); if (e.key === "Escape") setRenamingId(null); }}
                            onBlur={() => saveRename(t.id)}
                            className="flex-1 bg-transparent text-[12px] text-text-1 outline-none border-b border-accent"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex-1 min-w-0" onClick={() => loadThread(t.id, t.title)}>
                            <p className="text-[12px] font-600 text-text-1 truncate">{t.title ?? "Untitled"}</p>
                            {t.preview && <p className="text-[10px] text-text-3 truncate">{t.preview}</p>}
                          </div>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={e => { e.stopPropagation(); setRenamingId(t.id); setRenameValue(t.title ?? ""); }} className="p-1 rounded hover:bg-[rgba(255,255,255,0.08)] text-text-3" title="Rename"><Pencil size={10} /></button>
                          <button onClick={e => { e.stopPropagation(); deleteThread(t.id); }} className="p-1 rounded hover:bg-[rgba(248,113,113,0.12)] text-text-3 hover:text-danger" title="Delete"><Trash2 size={10} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Live voice orb banner — only when voice is on */}
            {voiceLive && (
              <div className="px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border-dim bg-[rgba(167,139,250,0.04)]">
                <div className="relative" style={{ width: 44, height: 44 }}>
                  <div
                    className="absolute inset-0 rounded-full transition-transform duration-100"
                    style={{
                      background: "radial-gradient(circle, rgba(29,155,240,0.35) 0%, rgba(167,139,250,0.2) 50%, transparent 75%)",
                      filter: "blur(8px)",
                      transform: `scale(${1 + realtime.audioLevel * 0.8})`,
                    }}
                  />
                  <div
                    className="absolute inset-1 rounded-full transition-transform duration-100"
                    style={{
                      background: realtime.phase === "error"
                        ? "radial-gradient(circle at 35% 30%, #f87171, #7f1d1d 60%, #000)"
                        : "radial-gradient(circle at 35% 30%, #7dd3fc 0%, #1d9bf0 35%, #312e81 80%, #000)",
                      boxShadow: "inset 0 0 14px rgba(255,255,255,0.18), 0 0 18px rgba(29,155,240,0.45)",
                      transform: `scale(${0.85 + realtime.audioLevel * 0.4})`,
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] uppercase tracking-[0.2em] font-700 ${realtime.phase === "error" ? "text-danger" : "text-[#a78bfa]"}`}>
                    {realtime.phase === "connecting" && "Connecting…"}
                    {realtime.phase === "listening"  && (realtime.muted ? "Muted" : "Listening")}
                    {realtime.phase === "thinking"   && "Thinking"}
                    {realtime.phase === "speaking"   && "Speaking"}
                    {realtime.phase === "error"      && "Voice failed"}
                    {(realtime.phase === "listening" || realtime.phase === "speaking" || realtime.phase === "thinking") && !realtime.toolsAttached && (
                      <span className="ml-2 text-warning normal-case tracking-normal font-500 text-[10px]">⚠ no tools attached — Alfred can talk but not act</span>
                    )}
                  </p>
                  {realtime.phase === "error" ? (
                    <div className="text-[10px] text-danger whitespace-pre-wrap break-all max-h-24 overflow-y-auto font-mono leading-tight">
                      {realtime.error ?? "Unknown error — tap end and try again"}
                    </div>
                  ) : (
                    <p className="text-[11px] truncate text-text-2">
                      {realtime.phase === "speaking"
                        ? realtime.partialAlfred
                        : realtime.partialUser || "Talk whenever"}
                    </p>
                  )}
                </div>
                <button
                  onClick={realtime.toggleMute}
                  className={`w-9 h-9 rounded-[10px] flex items-center justify-center border transition-all ${
                    realtime.muted ? "bg-danger text-black border-danger" : "border-border-dim text-text-2 hover:text-text-1"
                  }`}
                  title={realtime.muted ? "Unmute" : "Mute"}
                >
                  {realtime.muted ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                <button
                  onClick={toggleVoice}
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-danger text-black"
                  title="End voice"
                >
                  <PhoneOff size={14} />
                </button>
              </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.length === 0 && (
                <div className="text-[12px] text-text-3 text-center py-8">
                  <p className="mb-3">{config.isPublicDemo ? "Tap a question — this is a live demo." : "Ask anything. He sees the full OS."}</p>
                  <div className="flex flex-col gap-1.5 max-w-[300px] mx-auto text-left">
                    {(config.isPublicDemo ? DEMO_ALFRED_PROMPTS : [
                      "What should I focus on today?",
                      "Run my weekly review",
                      "How am I tracking vs my goals?",
                      "What was I doing one year ago?",
                    ]).map(s => (
                      <button key={s} onClick={() => { config.isPublicDemo ? send(s) : setInput(s); }} className="px-3 py-2 rounded-[10px] border border-border-dim hover:border-accent/40 bg-[rgba(255,255,255,0.02)] text-[11px] text-text-2 text-left transition-all">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isAssistant = m.role === "assistant";
                const isStreaming = isAssistant && i === messages.length - 1 && busy;
                return (
                  <div key={i} className={m.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[95%] flex flex-col gap-1.5"}>
                    {/* Per-tool status chips */}
                    {isAssistant && m.tools && m.tools.length > 0 && (
                      <div className="flex flex-col gap-1">
                        {m.tools.map((t, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[10px]">
                            {t.status === "running" && <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[#a78bfa] border-t-transparent animate-spin" />}
                            {t.status === "done"    && <span className="text-success">✓</span>}
                            {t.status === "failed"  && <span className="text-danger">✕</span>}
                            <span className="font-600 text-text-2">{TOOL_LABEL[t.name] ?? t.name}</span>
                            {t.status === "done"   && t.ms != null && <span className="text-text-3">· {t.ms < 1000 ? `${t.ms}ms` : `${(t.ms / 1000).toFixed(1)}s`}</span>}
                            {t.status === "failed" && <span className="text-danger">· failed</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Phase indicator while no text yet */}
                    {isStreaming && !m.content && m.phase !== "responding" && (
                      <div className="flex items-center gap-2 text-[11px] text-text-3 italic">
                        <span className="flex gap-0.5">
                          <span className="w-1 h-1 rounded-full bg-[#a78bfa] animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1 h-1 rounded-full bg-[#a78bfa] animate-bounce" style={{ animationDelay: "120ms" }} />
                          <span className="w-1 h-1 rounded-full bg-[#a78bfa] animate-bounce" style={{ animationDelay: "240ms" }} />
                        </span>
                        {m.phase === "tool_running" ? "Running tools…" : "Thinking…"}
                      </div>
                    )}

                    {/* Image thumbs on user messages */}
                    {!isAssistant && m.imageThumbs && m.imageThumbs.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-end mb-1">
                        {m.imageThumbs.map((src, idx) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={idx} src={src} alt="" className="w-16 h-16 rounded-[8px] object-cover border border-border-dim" />
                        ))}
                      </div>
                    )}

                    {/* Message bubble */}
                    {(m.content || (isAssistant && !isStreaming)) && (
                      <div
                        className={`px-3.5 py-2.5 rounded-[14px] text-[13px] leading-[1.5] whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-accent-dim text-text-1 border border-[rgba(29,155,240,0.28)]"
                            : "bg-[rgba(255,255,255,0.04)] text-text-1 border border-border-dim"
                        }`}
                      >
                        {m.content}
                        {isStreaming && m.content && <span className="inline-block w-1.5 h-3 ml-0.5 bg-accent animate-pulse align-middle" />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-border-dim relative">
              {/* Slash command autocomplete */}
              {input.startsWith("/") && (() => {
                const q = input.slice(1).toLowerCase();
                const matches = SLASH_COMMANDS.filter(c =>
                  c.id.slice(1).startsWith(q) || c.description.toLowerCase().includes(q),
                );
                if (matches.length === 0) return null;
                return (
                  <div className="absolute bottom-full left-3 right-3 mb-1 surface-solid rounded-[12px] p-1 flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                    {matches.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setInput(c.id); setTimeout(() => inputRef.current?.focus(), 0); }}
                        className="w-full text-left px-3 py-2 rounded-[8px] hover:bg-[rgba(255,255,255,0.04)] flex items-baseline gap-2"
                      >
                        <span className="text-[12px] font-700 text-accent font-mono">{c.id}</span>
                        <span className="text-[10px] text-text-3 truncate">{c.description}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
              {/* Pending image previews */}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {pendingImages.map((src, idx) => (
                    <div key={idx} className="relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-14 h-14 rounded-[8px] object-cover border border-border-dim" />
                      <button
                        onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-black flex items-center justify-center"
                        title="Remove"
                      ><Trash2 size={9} /></button>
                    </div>
                  ))}
                </div>
              )}
              {imageError && <p className="text-[10px] text-danger mb-1">{imageError}</p>}

              <div className="flex items-end gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) addImages(Array.from(e.target.files)); e.target.value = ""; }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy || pendingImages.length >= MAX_IMAGES}
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center text-text-2 hover:text-text-1 border border-border-dim hover:border-border disabled:opacity-30"
                  title="Attach image"
                >
                  <ImageIcon size={15} />
                </button>
                <button
                  onClick={() => { if (recording) stopRecording(); else startRecording().catch(() => {}); }}
                  disabled={busy || transcribing}
                  className={`w-10 h-10 rounded-[12px] flex items-center justify-center border transition-all disabled:opacity-30 ${
                    recording
                      ? "bg-danger text-black border-danger animate-pulse"
                      : transcribing
                        ? "border-border-dim text-text-3"
                        : "border-border-dim text-text-2 hover:text-text-1 hover:border-border"
                  }`}
                  title={recording ? "Stop recording (sends + transcribes)" : transcribing ? "Transcribing…" : "Voice input (Cmd+Shift+A)"}
                >
                  {recording ? <Square size={14} /> : transcribing ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Mic size={15} />}
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onPaste={async e => {
                    const items = Array.from(e.clipboardData?.items ?? []);
                    const imgs = items.filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean) as File[];
                    if (imgs.length > 0) { e.preventDefault(); await addImages(imgs); }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  rows={1}
                  placeholder={pendingImages.length > 0 ? "Add a note or hit send…" : "Ask Alfred…  (type / for commands · paste image to attach)"}
                  disabled={busy}
                  className="flex-1 px-3 py-2 text-[13px] resize-none max-h-32 min-h-[40px]"
                />
                <button
                  onClick={() => send()}
                  disabled={busy || (!input.trim() && pendingImages.length === 0)}
                  className="w-10 h-10 rounded-[12px] flex items-center justify-center text-black disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #1d9bf0, #a78bfa)" }}
                >
                  <Send size={15} />
                </button>
              </div>
              <p className="text-[9px] text-text-3 mt-1.5 text-center">
                ⌘J chat · ⌘⇧J Jarvis · ⌘⇧A mic · ⏎ send · ⇧⏎ newline
                {speaking && <span className="ml-2 text-[#a78bfa]">🔊 speaking… <button onClick={stopSpeaking} className="underline">stop</button></span>}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
