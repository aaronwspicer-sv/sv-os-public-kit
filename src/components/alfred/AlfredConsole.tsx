"use client";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import {
  Mic, MicOff, Send, Target, DollarSign, Video,
  Flame, Clock, Calendar, PhoneOff, Radio,
  Inbox, Zap,
} from "lucide-react";
import { config } from "@/config";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useRealtimeCtx } from "@/lib/alfred/realtimeContext";
import { useAlfredDock } from "@/lib/alfred/dockContext";
import { useDemoMode } from "@/components/ui/DemoModeContext";
import { cannedAlfred, demoAudioSrc, DEMO_ALFRED_PROMPTS } from "@/lib/demoAlfred";
import { DEMO_NET_WORTH, DEMO_INBOX_COUNT } from "@/lib/demoMode";

// ── Constants ─────────────────────────────────────────────────
const VOICE_KEY     = "alfred_voice";
const DEFAULT_VOICE = "ash";

// ── Node geometry ─────────────────────────────────────────────
const NODES = [
  { id: "content",  label: "CONTENT",  icon: Video,      cx: 200, cy: 60,  href: "/d/content"  },
  { id: "calendar", label: "CALENDAR", icon: Calendar,   cx: 321, cy: 130, href: "/d/calendar" },
  { id: "goals",    label: "GOALS",    icon: Target,     cx: 321, cy: 270, href: "/d/goals"    },
  { id: "finances", label: "FINANCES", icon: DollarSign, cx: 200, cy: 340, href: "/d/finances" },
  { id: "habits",   label: "HABITS",   icon: Flame,      cx: 79,  cy: 270, href: "/d/entry"    },
  { id: "time",     label: "TIME",     icon: Clock,      cx: 79,  cy: 130, href: "/d/time"     },
] as const;
type NodeId = typeof NODES[number]["id"];

// ── Brain graph types + helpers ───────────────────────────────
interface BrainNodeData {
  id: string;
  type: "memory" | "person" | "video";
  label: string;
  sublabel?: string;
  importance: number;
  tag?: string | null;
  content?: string;
  name?: string;
  slug?: string;
}
interface BrainNodePositioned extends BrainNodeData {
  cx: number; cy: number; r: number;
}

const BRAIN_COLORS = {
  memory: { fill: "rgba(29,155,240,0.12)",  stroke: "rgba(29,155,240,0.65)",  glow: "rgba(29,155,240,0.5)"  },
  person: { fill: "rgba(167,139,250,0.12)", stroke: "rgba(167,139,250,0.75)", glow: "rgba(167,139,250,0.5)" },
  video:  { fill: "rgba(251,146,60,0.12)",  stroke: "rgba(251,146,60,0.65)",  glow: "rgba(251,146,60,0.5)"  },
};

const GOLDEN_ANGLE = 2.399963; // 137.508° in radians

function positionBrainNodes(nodes: BrainNodeData[]): BrainNodePositioned[] {
  const sorted = [...nodes].sort((a, b) => {
    const typeOrder = { person: 0, video: 1, memory: 2 };
    if (a.type !== b.type) return typeOrder[a.type] - typeOrder[b.type];
    return (b.importance ?? 5) - (a.importance ?? 5);
  });
  return sorted.map((node, i) => {
    const angle = i * GOLDEN_ANGLE;
    const imp = node.importance ?? 5;
    const radius = 162 - (imp / 10) * 88; // imp=10→r=74, imp=1→r=153
    const cx = 200 + radius * Math.cos(angle);
    const cy = 200 + radius * Math.sin(angle);
    const r = node.type === "person" ? 12 : node.type === "video" ? 10 : Math.max(7, Math.min(12, imp * 1.05));
    return { ...node, cx, cy, r };
  });
}

function getBrainEdges(nodes: BrainNodePositioned[]) {
  const edges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      // Same-tag memories
      if (a.tag && b.tag && a.tag === b.tag && a.type === "memory" && b.type === "memory") {
        edges.push({ x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy, color: "rgba(29,155,240,0.18)" });
      }
      // Person ↔ memory containing their name
      const checkPersonMemory = (person: BrainNodePositioned, mem: BrainNodePositioned) => {
        if (person.type === "person" && mem.type === "memory" && mem.content) {
          if (mem.content.toLowerCase().includes((person.name ?? person.label).toLowerCase())) {
            edges.push({ x1: person.cx, y1: person.cy, x2: mem.cx, y2: mem.cy, color: "rgba(167,139,250,0.15)" });
          }
        }
      };
      checkPersonMemory(a, b);
      checkPersonMemory(b, a);
    }
  }
  return edges;
}

function getLabelProps(n: BrainNodePositioned) {
  const dx = n.cx - 200, dy = n.cy - 200;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const off = n.r + 15;
  const lx = n.cx + (dx / dist) * off;
  const ly = n.cy + (dy / dist) * off;
  const anchor = (n.cx < 155 ? "end" : n.cx > 245 ? "start" : "middle") as "end" | "start" | "middle";
  return { lx, ly, anchor };
}

// ── Brain Graph component ─────────────────────────────────────
function BrainGraph({ nodes, speaking, audioLevel = 0, onNodeClick }: {
  nodes: BrainNodeData[];
  speaking: boolean;
  audioLevel?: number;
  onNodeClick: (node: BrainNodeData) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const scale = 1 + audioLevel * 0.6;

  const positioned = useMemo(() => positionBrainNodes(nodes), [nodes]);
  const edges      = useMemo(() => getBrainEdges(positioned), [positioned]);

  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" aria-hidden>
      <defs>
        <radialGradient id="bgBrain" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#1D9BF0" stopOpacity={speaking ? "0.45" : "0.12"} />
          <stop offset="65%"  stopColor="#a78bfa" stopOpacity={speaking ? "0.12" : "0"} />
          <stop offset="100%" stopColor="#1D9BF0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="rcBrain"><circle cx="200" cy="200" r="192" /></clipPath>
        <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background glow */}
      <circle cx="200" cy="200" r="120" fill="url(#bgBrain)"
        style={{ transition: "all 0.3s", transform: `scale(${scale})`, transformOrigin: "200px 200px" }} />

      {/* Radar sweep */}
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-sweep 10s linear infinite" }} clipPath="url(#rcBrain)">
        <path d="M200 200 L200 12 A188 188 0 0 1 296 120 Z" fill="rgba(29,155,240,0.06)" />
        <line x1="200" y1="200" x2="200" y2="12" stroke="rgba(29,155,240,0.25)" strokeWidth="1" />
      </g>

      {/* Ambient orbit rings — slow rotation adds life */}
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-spin-cw 55s linear infinite" }}>
        <circle cx="200" cy="200" r="85" fill="none" stroke="rgba(29,155,240,0.05)" strokeWidth="0.5" strokeDasharray="2 9" />
      </g>
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-spin-ccw 95s linear infinite" }}>
        <circle cx="200" cy="200" r="148" fill="none" stroke="rgba(29,155,240,0.09)" strokeWidth="0.5" strokeDasharray="3 7" />
      </g>

      {/* Edges */}
      {edges.map((e, i) => (
        <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
          stroke={e.color} strokeWidth="0.75" strokeDasharray="3 5" />
      ))}

      {/* Spoke lines — center to each node */}
      {positioned.map(n => (
        <line key={n.id} x1="200" y1="200" x2={n.cx} y2={n.cy}
          stroke="rgba(255,255,255,0.06)" strokeWidth="0.75" />
      ))}

      {/* Nodes */}
      {positioned.map((n, idx) => {
        const hovered = hoveredId === n.id;
        const c = BRAIN_COLORS[n.type];
        const { lx, ly, anchor } = getLabelProps(n);
        const label = n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label;
        const floatDur   = (8  + ((idx * 1.31) % 6)).toFixed(1);
        const floatDelay = ((idx * 1.73) % 5).toFixed(1);
        return (
          <g key={n.id}
            onClick={() => onNodeClick(n)}
            onMouseEnter={() => setHoveredId(n.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              cursor: "pointer",
              animation: `alfred-node-pop 0.5s ease-out ${idx * 45}ms both, alfred-float-y ${floatDur}s ease-in-out ${floatDelay}s infinite alternate`,
            }}
          >
            {/* Glow ring on hover */}
            {hovered && (
              <circle cx={n.cx} cy={n.cy} r={n.r + 6}
                fill="none" stroke={c.glow} strokeWidth="1.5"
                style={{ animation: "alfred-pulse-ring 1s ease-in-out infinite" }} />
            )}
            {/* Main circle */}
            <circle cx={n.cx} cy={n.cy} r={n.r}
              fill={hovered ? c.fill.replace("0.12", "0.3") : c.fill.replace("0.12", "0.16")}
              stroke={hovered ? c.stroke : c.stroke.replace("0.65", "0.55").replace("0.75", "0.62")}
              strokeWidth={hovered ? 1.5 : 1}
              style={{ transition: "all 0.2s" }}
              filter={hovered ? "url(#nodeGlow)" : undefined}
            />
            {/* Inner bright dot */}
            <circle cx={n.cx} cy={n.cy} r={2}
              fill={hovered ? c.stroke : "rgba(255,255,255,0.45)"} />
            {/* Label */}
            <text x={lx} y={ly}
              textAnchor={anchor} fontSize="7" fontFamily="monospace" letterSpacing="0.6"
              fill={hovered ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)"}
              style={{ userSelect: "none", pointerEvents: "none", transition: "fill 0.2s" }}
            >{label}</text>
            {hovered && n.sublabel && (
              <text x={lx} y={ly + 10}
                textAnchor={anchor} fontSize="6" fontFamily="monospace" letterSpacing="0.4"
                fill="rgba(255,255,255,0.5)"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >{String(n.sublabel).slice(0, 18)}</text>
            )}
          </g>
        );
      })}

      {/* Audio visualizer arcs — rotate when voice active */}
      {(speaking || audioLevel > 0.02) && (
        <g style={{ transformOrigin: "200px 200px", animation: `alfred-hud-arc ${1.8 - audioLevel * 0.8}s linear infinite` }}>
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const r = 58 + audioLevel * 14;
            const arcLen = 22 + i * 3 + audioLevel * 12;
            const x1 = 200 + r * Math.cos(rad);
            const y1 = 200 + r * Math.sin(rad);
            const x2 = 200 + r * Math.cos(rad + (arcLen * Math.PI) / 180);
            const y2 = 200 + r * Math.sin(rad + (arcLen * Math.PI) / 180);
            const large = arcLen > 180 ? 1 : 0;
            return (
              <path key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
                fill="none"
                stroke={i % 2 === 0 ? `rgba(29,155,240,${0.55 + audioLevel * 0.4})` : `rgba(167,139,250,${0.35 + audioLevel * 0.4})`}
                strokeWidth={1 + audioLevel * 1.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}

      {/* Center disc — same as OrbitalSVG */}
      <circle cx="200" cy="200" r="50" fill="rgba(2,5,14,0.97)" stroke="rgba(29,155,240,0.38)" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="42" fill="none" stroke="rgba(29,155,240,0.1)" strokeWidth="0.75" />
      {speaking && (
        <circle cx="200" cy="200" r="50" fill="none" stroke="rgba(29,155,240,0.55)" strokeWidth="1.5"
          style={{ animation: "alfred-pulse-ring 0.9s ease-in-out infinite" }} />
      )}
      <text x="200" y="196" textAnchor="middle" fontSize="11.5" fontFamily="monospace" letterSpacing="3.5"
        fill={speaking ? "#7dd3fc" : "rgba(29,155,240,0.95)"}
        style={{ transition: "fill 0.4s", animation: speaking ? undefined : "alfred-breath 3.5s ease-in-out infinite" }}>ALFRED</text>
      <text x="200" y="211" textAnchor="middle" fontSize="6.5" fontFamily="monospace" letterSpacing="2"
        fill={speaking ? "rgba(29,155,240,0.7)" : "rgba(255,255,255,0.22)"}>
        {speaking ? "SPEAKING" : "ONLINE"}
      </text>
    </svg>
  );
}

// ── Time ──────────────────────────────────────────────────────
const tz = () => config.locale.timezone;
const getTime = () => new Date().toLocaleTimeString("en-US", { timeZone: tz(), hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const getDate = () => new Date().toLocaleDateString("en-US", { timeZone: tz(), weekday: "short", month: "short", day: "numeric" }).toUpperCase();
function loadVoice(): string {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  try { return localStorage.getItem(VOICE_KEY) ?? DEFAULT_VOICE; } catch { return DEFAULT_VOICE; }
}

function useCountUp(target: number | null): number | null {
  const [val, setVal] = useState<number | null>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === null) { setVal(null); return; }
    if (target === 0)    { setVal(0);    return; }
    setVal(0);
    cancelAnimationFrame(rafRef.current);
    const duration = 1400;
    const startAt  = performance.now() + 220;
    const run = (now: number) => {
      if (now < startAt) { rafRef.current = requestAnimationFrame(run); return; }
      const t    = Math.min(1, (now - startAt) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(run);
    };
    rafRef.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);
  return val;
}

// ── SSE streaming ─────────────────────────────────────────────
async function streamAlfred(
  msg: string,
  history: { role: "user" | "assistant"; content: string }[],
  onText: (t: string) => void,
  onNav?: (url: string) => void,
  onDone?: (full: string) => void,
) {
  let full = "";
  try {
    const model = (() => { try { return localStorage.getItem("alfred_model") ?? "gpt-4.1"; } catch { return "gpt-4.1"; } })();
    const res = await fetch("/api/alfred/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, model, history }),
    });
    if (!res.body) { onDone?.(full); return; }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(l.slice(6));
          if (ev.kind === "text") { full += ev.data; onText(ev.data); }
          if (ev.kind === "navigate") onNav?.(ev.data?.url);
          if (ev.kind === "done") { onDone?.(full); return; }
        } catch {}
      }
    }
  } catch {}
  onDone?.(full);
}

// ── Orbital SVG ───────────────────────────────────────────────
function OrbitalSVG({ onNav, speaking, audioLevel = 0 }: {
  onNav: (href: string) => void; speaking: boolean; audioLevel?: number;
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const scale = 1 + audioLevel * 0.6;
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" aria-hidden>
      <defs>
        <radialGradient id="cg2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1D9BF0" stopOpacity={speaking ? "0.5" : "0.15"} />
          <stop offset="70%" stopColor="#a78bfa" stopOpacity={speaking ? "0.15" : "0"} />
          <stop offset="100%" stopColor="#1D9BF0" stopOpacity="0" />
        </radialGradient>
        <clipPath id="rc2"><circle cx="200" cy="200" r="192" /></clipPath>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* center glow */}
      <circle cx="200" cy="200" r="120" fill="url(#cg2)"
        style={{ transition: "all 0.3s", transform: `scale(${scale})`, transformOrigin: "200px 200px" }} />

      {/* rings — three speeds, alternating directions */}
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-spin-cw 60s linear infinite" }}>
        <circle cx="200" cy="200" r="72" fill="none" stroke="rgba(29,155,240,0.07)" strokeWidth="0.5" strokeDasharray="2 8" />
      </g>
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-spin-ccw 95s linear infinite" }}>
        <circle cx="200" cy="200" r="130" fill="none" stroke="rgba(29,155,240,0.18)" strokeWidth="0.75" strokeDasharray="3 6" />
      </g>
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-spin-cw 190s linear infinite" }}>
        <circle cx="200" cy="200" r="188" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="1 10" />
      </g>

      {/* sweep */}
      <g style={{ transformOrigin: "200px 200px", animation: "alfred-sweep 10s linear infinite" }} clipPath="url(#rc2)">
        <path d="M200 200 L200 12 A188 188 0 0 1 296 120 Z" fill="rgba(29,155,240,0.04)" />
        <line x1="200" y1="200" x2="200" y2="12" stroke="rgba(29,155,240,0.2)" strokeWidth="0.75" />
      </g>

      {/* spokes */}
      {NODES.map(n => (
        <line key={n.id} x1="200" y1="200" x2={n.cx} y2={n.cy}
          stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" strokeDasharray="2 6"
        />
      ))}

      {/* nodes */}
      {NODES.map(n => {
        const hovered = hoveredNode === n.id;
        return (
          <g key={n.id} onClick={() => onNav(n.href)} style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredNode(n.id)}
            onMouseLeave={() => setHoveredNode(null)}>
            {hovered && (
              <circle cx={n.cx} cy={n.cy} r="21" fill="none"
                stroke="rgba(29,155,240,0.45)" strokeWidth="1"
                style={{ animation: "alfred-pulse-ring 0.85s ease-in-out infinite" }} />
            )}
            <circle cx={n.cx} cy={n.cy} r="14"
              fill={hovered ? "rgba(29,155,240,0.1)" : "rgba(3,7,18,0.9)"}
              stroke={hovered ? "rgba(29,155,240,0.65)" : "rgba(255,255,255,0.1)"}
              strokeWidth="1"
              style={{ transition: "all 0.2s" }}
            />
            <circle cx={n.cx} cy={n.cy} r="2" fill={hovered ? "rgba(29,155,240,0.9)" : "rgba(255,255,255,0.18)"} />
            <text x={n.cx} y={n.cy + (n.cy < 200 ? -23 : 27)}
              textAnchor="middle" fontSize="6.5" fontFamily="monospace" letterSpacing="1.8"
              fill={hovered ? "rgba(29,155,240,0.7)" : "rgba(255,255,255,0.22)"}
              style={{ userSelect: "none" as const, pointerEvents: "none" as const }}
            >{n.label}</text>
          </g>
        );
      })}

      {/* Audio visualizer arcs */}
      {(speaking || audioLevel > 0.02) && (
        <g style={{ transformOrigin: "200px 200px", animation: `alfred-hud-arc ${1.8 - audioLevel * 0.8}s linear infinite` }}>
          {[0, 60, 120, 180, 240, 300].map((deg, i) => {
            const rad = (deg * Math.PI) / 180;
            const r = 58 + audioLevel * 14;
            const arcLen = 22 + i * 3 + audioLevel * 12;
            const x1 = 200 + r * Math.cos(rad);
            const y1 = 200 + r * Math.sin(rad);
            const x2 = 200 + r * Math.cos(rad + (arcLen * Math.PI) / 180);
            const y2 = 200 + r * Math.sin(rad + (arcLen * Math.PI) / 180);
            const large = arcLen > 180 ? 1 : 0;
            return (
              <path key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
                fill="none"
                stroke={i % 2 === 0 ? `rgba(29,155,240,${0.55 + audioLevel * 0.4})` : `rgba(167,139,250,${0.35 + audioLevel * 0.4})`}
                strokeWidth={1 + audioLevel * 1.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      )}

      {/* center disc */}
      <circle cx="200" cy="200" r="50" fill="rgba(2,5,14,0.97)" stroke="rgba(29,155,240,0.38)" strokeWidth="1.5" />
      <circle cx="200" cy="200" r="42" fill="none" stroke="rgba(29,155,240,0.1)" strokeWidth="0.75" />
      {speaking && (
        <circle cx="200" cy="200" r="50" fill="none" stroke="rgba(29,155,240,0.55)" strokeWidth="1.5"
          style={{ animation: "alfred-pulse-ring 0.9s ease-in-out infinite" }} />
      )}
      <text x="200" y="196" textAnchor="middle" fontSize="11.5" fontFamily="monospace" letterSpacing="3.5"
        fill={speaking ? "#7dd3fc" : "rgba(29,155,240,0.95)"}
        style={{ transition: "fill 0.4s", animation: speaking ? undefined : "alfred-breath 3.5s ease-in-out infinite" }}>ALFRED</text>
      <text x="200" y="211" textAnchor="middle" fontSize="6.5" fontFamily="monospace" letterSpacing="2"
        fill={speaking ? "rgba(29,155,240,0.7)" : "rgba(255,255,255,0.22)"}>
        {speaking ? "SPEAKING" : "ONLINE"}
      </text>
    </svg>
  );
}

// ── Node overlay ──────────────────────────────────────────────
// ── Types ─────────────────────────────────────────────────────
interface CData {
  todos: any[] | null;
  streaks: { workout: number; video: number; journal: number; nf: number } | null;
  logEntry: any;
  netWorth: number | null;
  videos: { id: string; status: string }[] | null;
  nextEvent: { title: string; start: string; allDay: boolean } | null;
  inbox: any[] | null;
}
interface Msg { role: "user" | "assistant"; content: string; streaming?: boolean; tool?: string; toolStatus?: "done" | "failed" }


// ── Root ──────────────────────────────────────────────────────
export function AlfredConsole() {
  const { undock, dock } = useAlfredDock();
  const { isDemoMode } = useDemoMode();

  // Set body attribute synchronously before first paint — eliminates sidebar flash
  useLayoutEffect(() => {
    document.body.setAttribute("data-alfred-console", "1");
    return () => document.body.removeAttribute("data-alfred-console");
  }, []);

  // Undock Alfred from mini-orb mode
  useEffect(() => { undock(); }, [undock]);

  // Sleep
  const [sleeping, setSleeping] = useState(true);

  // Time
  const [time,    setTime]  = useState(getTime);
  const [dateStr, setDate]  = useState(getDate);

  // Chat
  const [msgs,      setMsgs]      = useState<Msg[]>([]);
  const [input,     setInput]     = useState("");
  const [busy,      setBusy]      = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const chatHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLTextAreaElement>(null);
  const greetedRef    = useRef(false);
  const [voice, setVoice] = useState(DEFAULT_VOICE);

  // Brain badge (hermes vs gpt)
  const [brainLabel, setBrainLabel] = useState("GPT-4.1");
  useEffect(() => {
    if (isDemoMode) { setBrainLabel("DEMO"); return; }
    fetch("/api/alfred/brain").then(r => r.json()).then(d => setBrainLabel(d.label ?? "GPT-4.1")).catch(() => {});
  }, [isDemoMode]);

  // Brain graph nodes — null = loading, [] = empty (show fallback orbital)
  const [brainNodes, setBrainNodes] = useState<BrainNodeData[] | null>(null);
  useEffect(() => {
    if (isDemoMode) { setBrainNodes([]); return; }
    fetch("/api/alfred/brain-nodes")
      .then(r => r.json())
      .then(d => setBrainNodes(d.nodes ?? []))
      .catch(() => setBrainNodes([]));
  }, [isDemoMode]);

  // Chat panel visibility — hidden until Alfred responds
  const [chatOpen, setChatOpen] = useState(false);
  // Guest mode — hands console to a visitor, Alfred restricts sensitive data
  const [guestMode, setGuestMode] = useState(false);
  const [guestName, setGuestName] = useState("");

  // Data
  const [d, setD] = useState<CData>({
    todos: null, streaks: null, logEntry: null,
    netWorth: null, videos: null, nextEvent: null, inbox: null,
  });

  // TTS
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {});

  const speak = useCallback((text: string): Promise<void> => {
    if (!text) return Promise.resolve();
    setSpeaking(true);
    return new Promise<void>(resolve => {
      (async () => {
        try {
          const v = loadVoice();
          const res = await fetch("/api/alfred/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voice: v }),
          });
          if (!res.ok) { setSpeaking(false); resolve(); return; }
          const blob = await res.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); resolve(); };
          await audio.play();
        } catch { setSpeaking(false); resolve(); }
      })();
    });
  }, []);

  useEffect(() => { speakRef.current = speak; }, [speak]);

  // Animated countup for key stats — run when data first arrives
  const cNetWorth = useCountUp(d.netWorth);
  const cStreak0  = useCountUp(d.streaks?.workout ?? null);
  const cStreak1  = useCountUp(d.streaks?.video   ?? null);
  const cStreak2  = useCountUp(d.streaks?.journal ?? null);
  const cStreak3  = useCountUp(d.streaks?.nf      ?? null);

  // Demo-aware chat dispatcher — bypasses all API calls when isDemoMode is true.
  const chatWith = useCallback(async (
    msg: string,
    history: { role: "user" | "assistant"; content: string }[],
    onText: (t: string) => void,
    onNav?: (url: string) => void,
    onDone?: (full: string) => void,
  ) => {
    if (isDemoMode) {
      const { id, answer } = cannedAlfred(msg);
      const CHUNK = 5;
      for (let i = 0; i < answer.length; i += CHUNK) {
        await new Promise<void>(r => setTimeout(r, 16));
        onText(answer.slice(i, Math.min(i + CHUNK, answer.length)));
      }
      onDone?.(answer);
      // Play pre-recorded clip; falls back to silence if file absent
      const clip = new Audio(demoAudioSrc(id));
      setSpeaking(true);
      clip.onended = () => setSpeaking(false);
      clip.onerror = () => setSpeaking(false);
      clip.play().catch(() => setSpeaking(false));
      return;
    }
    await streamAlfred(msg, history, onText, onNav, onDone);
  }, [isDemoMode]);

  // Shared realtime session — lives at layout level, persists across navigation
  const realtime = useRealtimeCtx();
  const voiceLive = realtime.phase !== "idle";

  // Keep a ref so navigateTo (stable callback) can check voice state without stale closure
  const voiceLiveRef = useRef(false);
  useEffect(() => { voiceLiveRef.current = voiceLive; }, [voiceLive]);

  // Navigate helper — skip docking when voice is active so VoiceBanner shows on the new page
  const navigateTo = useCallback((url: string) => {
    if (voiceLiveRef.current) {
      window.dispatchEvent(new CustomEvent("alfred:nav-start", { detail: { url } }));
      return;
    }
    const lastAlfredMsg = chatHistory.current.filter(m => m.role === "assistant").at(-1)?.content ?? "";
    dock(lastAlfredMsg);
    window.dispatchEvent(new CustomEvent("alfred:nav-start", { detail: { url } }));
  }, [dock]);

  // Receive voice turn events broadcast by RealtimeProvider
  useEffect(() => {
    const onUser = (e: Event) => {
      const text = (e as CustomEvent).detail.text as string;
      setMsgs(p => [...p, { role: "user", content: text }]);
      chatHistory.current.push({ role: "user", content: text });
    };
    const onAlfred = (e: Event) => {
      const text = (e as CustomEvent).detail.text as string;
      setMsgs(p => {
        const last = p[p.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          const copy = [...p]; copy[copy.length - 1] = { role: "assistant", content: text }; return copy;
        }
        return [...p, { role: "assistant", content: text }];
      });
      chatHistory.current.push({ role: "assistant", content: text });
    };
    const onDelta = (e: Event) => {
      const full = (e as CustomEvent).detail.full as string;
      setMsgs(p => {
        const last = p[p.length - 1];
        if (last?.role === "assistant" && last.streaming) {
          const copy = [...p]; copy[copy.length - 1] = { role: "assistant", content: full, streaming: true }; return copy;
        }
        return [...p, { role: "assistant", content: full, streaming: true }];
      });
    };
    const onTool = (e: Event) => {
      const { name, result } = (e as CustomEvent).detail as { name: string; result: unknown };
      const ok = !(result && typeof result === "object" && "error" in (result as object));
      setChatOpen(true);
      setMsgs(p => [...p, { role: "assistant", content: "", tool: name, toolStatus: ok ? "done" : "failed" }]);
    };
    window.addEventListener("alfred:voice-user-turn",    onUser);
    window.addEventListener("alfred:voice-alfred-turn",  onAlfred);
    window.addEventListener("alfred:voice-alfred-delta", onDelta);
    window.addEventListener("alfred:voice-tool-call",    onTool);
    return () => {
      window.removeEventListener("alfred:voice-user-turn",    onUser);
      window.removeEventListener("alfred:voice-alfred-turn",  onAlfred);
      window.removeEventListener("alfred:voice-alfred-delta", onDelta);
      window.removeEventListener("alfred:voice-tool-call",    onTool);
    };
  }, []);

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => { setTime(getTime()); setDate(getDate()); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Load voice
  useEffect(() => { setVoice(loadVoice()); }, []);

  // Wake word is on by default — nothing to force here

  // Fetch data
  useEffect(() => {
    if (isDemoMode) {
      setD({
        todos: [
          { id: "d1", text: "Review Costco charge", done: false },
          { id: "d2", text: "Film video #2 of the month", done: false },
          { id: "d3", text: "Weekly review", done: true },
        ],
        streaks: { workout: 3, video: 1, journal: 3, nf: 5 },
        logEntry: { hours: 7.5, energy: 4 },
        netWorth: DEMO_NET_WORTH,
        videos: [{ id: "v1", status: "Script" }, { id: "v2", status: "Editing" }],
        nextEvent: { title: "Content Planning Call", start: new Date(Date.now() + 3600000).toISOString(), allDay: false },
        inbox: Array.from({ length: DEMO_INBOX_COUNT }, (_, i) => ({ id: String(i), confirmed: false })),
      });
      return;
    }
    fetch("/api/todos").then(r => r.json()).then(r => setD(p => ({ ...p, todos: r.todayGoals ?? [] }))).catch(() => {});
    fetch("/api/notion/streaks").then(r => r.json()).then(r => setD(p => ({ ...p, streaks: r.streaks ?? null }))).catch(() => {});
    fetch("/api/notion/log").then(r => r.json()).then(r => setD(p => ({ ...p, logEntry: r.entry ?? null }))).catch(() => {});
    fetch("/api/net-worth").then(r => r.json()).then(r => setD(p => ({ ...p, netWorth: r.netWorth ?? 0 }))).catch(() => {});
    fetch("/api/notion/videos").then(r => r.json()).then(r => setD(p => ({ ...p, videos: r.videos ?? [] }))).catch(() => {});
    fetch("/api/calendar/events?days=3").then(r => r.json()).then(r => {
      const ev = (r.events ?? []).find((e: any) => new Date(e.start) > new Date()) ?? null;
      setD(p => ({ ...p, nextEvent: ev }));
    }).catch(() => {});
    fetch("/api/bank/transactions").then(r => r.json()).then(r =>
      setD(p => ({ ...p, inbox: (r.transactions ?? []).filter((t: any) => !t.confirmed) }))
    ).catch(() => {});
  }, [isDemoMode]);

  // Scroll chat when messages update — never force-open (user controls visibility)
  useEffect(() => {
    if (!chatOpen || !chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, chatOpen]);

  // Sync speaking with realtime
  useEffect(() => {
    const on  = () => { setSpeaking(true);  window.dispatchEvent(new Event("alfred:realtime-start")); };
    const off = () => { setSpeaking(false); window.dispatchEvent(new Event("alfred:realtime-end")); };
    window.addEventListener("alfred:realtime-start", on);
    window.addEventListener("alfred:realtime-end",   off);
    return () => { window.removeEventListener("alfred:realtime-start", on); window.removeEventListener("alfred:realtime-end", off); };
  }, []);

  // ── Wake ─────────────────────────────────────────────────────
  const voiceRef = useRef(voice);
  useEffect(() => { voiceRef.current = voice; }, [voice]);

  const wake = useCallback((e?: Event) => {
    void e;
    if (!sleeping) return;
    setSleeping(false);
    if (greetedRef.current) return;
    greetedRef.current = true;
    setChatOpen(true);
    setTimeout(() => {
      // In demo mode use a prompt that maps to a canned response; in real mode use the internal brief
      const greeting = isDemoMode
        ? "What should I focus on today?"
        : "Give me a sharp 2-sentence brief — tasks, streak, anything outstanding. Direct, no filler.";
      setMsgs([{ role: "assistant", content: "", streaming: true }]);
      chatWith(
        greeting,
        [],
        chunk => setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk, streaming: true }; return copy; }),
        url => navigateTo(url),
        full => {
          setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: full }; return copy; });
          chatHistory.current.push({ role: "assistant", content: full });
          // Auto-connect realtime voice after greeting TTS finishes (skip in demo)
          if (!isDemoMode) {
            speakRef.current(full).then(() => {
              if (!voiceLiveRef.current) {
                realtime.connect(voiceRef.current).catch(() => {});
              }
            });
          }
        },
      );
    }, 300);
  }, [sleeping, isDemoMode, chatWith, realtime, navigateTo]);

  // alfred:wake fires from WakeWord.tsx ("hey alfred" detected)
  useEffect(() => {
    const h = (e: Event) => wake(e);
    window.addEventListener("alfred:wake", h);
    return () => window.removeEventListener("alfred:wake", h);
  }, [wake]);

  // alfred:navigate from AlfredFab — same cinematic transition
  useEffect(() => {
    const h = (e: Event) => {
      const url = (e as CustomEvent).detail?.url as string;
      if (url) navigateTo(url);
    };
    window.addEventListener("alfred:navigate", h);
    return () => window.removeEventListener("alfred:navigate", h);
  }, [navigateTo]);

  // ── Send message ─────────────────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setChatOpen(true);
    // Voice is live → feed the SAME session so spoken + typed are one conversation
    // (Alfred answers it by voice; the turn echoes into the chat via listeners).
    if (voiceLive && realtime.sendText(text)) {
      setMsgs(p => [...p, { role: "user", content: text }, { role: "assistant", content: "", streaming: true }]);
      chatHistory.current.push({ role: "user", content: text });
      return;
    }
    setBusy(true);
    const userMsg: Msg = { role: "user", content: text };
    const placeholder: Msg = { role: "assistant", content: "", streaming: true };
    setMsgs(p => [...p, userMsg, placeholder]);
    chatHistory.current.push({ role: "user", content: text });
    try {
      await chatWith(
        text,
        chatHistory.current.slice(-12),
        chunk => setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk, streaming: true }; return copy; }),
        url => navigateTo(url),
        full => {
          setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: full }; return copy; });
          chatHistory.current.push({ role: "assistant", content: full });
        },
      );
    } catch {
      setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant" && last.streaming) copy[copy.length - 1] = { role: "assistant", content: "Hmm — I couldn't reach my brain just then. Try that again." }; return copy; });
    } finally {
      setBusy(false);
    }
  }, [input, busy, chatWith, navigateTo, voiceLive, realtime]);

  // Send a message directly (used by brain node clicks)
  const sendDirect = useCallback(async (text: string) => {
    if (busy) return;
    setChatOpen(true);
    if (voiceLive && realtime.sendText(text)) {
      setMsgs(p => [...p, { role: "user", content: text }, { role: "assistant", content: "", streaming: true }]);
      chatHistory.current.push({ role: "user", content: text });
      return;
    }
    setBusy(true);
    setMsgs(p => [...p, { role: "user", content: text }, { role: "assistant", content: "", streaming: true }]);
    chatHistory.current.push({ role: "user", content: text });
    try {
      await chatWith(
        text,
        chatHistory.current.slice(-12),
        chunk => setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk, streaming: true }; return copy; }),
        url => navigateTo(url),
        full => {
          setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: full }; return copy; });
          chatHistory.current.push({ role: "assistant", content: full });
        },
      );
    } catch {
      setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant" && last.streaming) copy[copy.length - 1] = { role: "assistant", content: "Hmm — I couldn't reach my brain just then. Try that again." }; return copy; });
    } finally {
      setBusy(false);
    }
  }, [busy, chatWith, navigateTo, voiceLive, realtime]);

  // Voice toggle
  const toggleVoice = useCallback(async () => {
    if (isDemoMode) return;
    if (voiceLive) realtime.disconnect();
    else await realtime.connect(voice);
  }, [isDemoMode, voiceLive, realtime, voice]);


  // ── Sleep screen ─────────────────────────────────────────────
  if (sleeping) {
    return (
      <div
        className="flex flex-col items-center justify-center relative overflow-hidden select-none w-full"
        style={{ minHeight: "100svh", background: "#020509" }}
        onClick={() => wake()}
        tabIndex={0}
        role="button"
        aria-label="Wake Alfred"
      >

        {/* Slow orbital rings */}
        {[100, 160, 230, 310].map((r, i) => (
          <div key={r} className="absolute rounded-full pointer-events-none" style={{
            width: r * 2, height: r * 2,
            left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            border: `1px ${i === 0 ? "solid" : "dashed"} ${i === 0 ? "rgba(29,155,240,0.14)" : "rgba(255,255,255,0.03)"}`,
            animation: `alfred-spin-${i % 2 === 0 ? "cw" : "ccw"} ${40 + i * 20}s linear infinite`,
          }} />
        ))}

        {/* Particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <span key={i} className="absolute rounded-full pointer-events-none" style={{
            width: `${1 + (i % 2)}px`, height: `${1 + (i % 2)}px`,
            left: `${(i * 37 + 11) % 100}%`, top: `${(i * 23 + 7) % 100}%`,
            background: i % 8 === 0 ? "rgba(29,155,240,0.5)" : "rgba(255,255,255,0.06)",
            animation: `alfred-float ${6 + (i % 4)}s ease-in-out ${(i * 0.4) % 3}s infinite alternate`,
          }} />
        ))}

        {/* Clock */}
        <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8">
          <p className="text-[10px] font-mono tracking-[0.38em] text-[rgba(255,255,255,0.22)]">{dateStr}</p>

          <div className="font-mono font-200 tabular-nums leading-none" style={{
            fontSize: "clamp(52px,10vw,96px)",
            letterSpacing: "-3px",
            color: "rgba(255,255,255,0.88)",
            textShadow: "0 0 60px rgba(29,155,240,0.2)",
          }}>{time}</div>

          <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2" style={{
            boxShadow: "0 0 16px rgba(29,155,240,0.9)",
            animation: "alfred-blink 2.5s ease-in-out infinite",
          }} />

          <p className="mt-6 text-[10px] font-mono tracking-[0.28em] text-[rgba(255,255,255,0.2)]"
            style={{ animation: "alfred-blink 4s ease-in-out infinite" }}>
            SAY "HEY ALFRED" OR TAP TO WAKE
          </p>
        </div>
      </div>
    );
  }

  // ── Active console ────────────────────────────────────────────
  const lastMsg = msgs[msgs.length - 1];
  const alfredStreaming = lastMsg?.role === "assistant" && lastMsg.streaming;

  return (
    <div
      id="alfred-console"
      className="flex relative overflow-hidden w-full"
      style={{ minHeight: "100svh", background: "#020509" }}
    >

      {/* ── Bridge HUD frame — corner brackets make it a viewport ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        <span className="absolute top-2.5 left-2.5 w-4 h-4" style={{ borderTop: "2px solid rgba(62,176,255,0.5)", borderLeft: "2px solid rgba(62,176,255,0.5)" }} />
        <span className="absolute top-2.5 right-2.5 w-4 h-4" style={{ borderTop: "2px solid rgba(62,176,255,0.5)", borderRight: "2px solid rgba(62,176,255,0.5)" }} />
        <span className="absolute bottom-2.5 left-2.5 w-4 h-4" style={{ borderBottom: "2px solid rgba(62,176,255,0.5)", borderLeft: "2px solid rgba(62,176,255,0.5)" }} />
        <span className="absolute bottom-2.5 right-2.5 w-4 h-4" style={{ borderBottom: "2px solid rgba(62,176,255,0.5)", borderRight: "2px solid rgba(62,176,255,0.5)" }} />
      </div>

      {/* ── Left sidebar (data panels) ──────────────────── */}
      <div className="hidden lg:flex flex-col w-[240px] flex-shrink-0 relative z-10 overflow-y-auto"
        style={{ borderRight: "1px solid rgba(255,255,255,0.09)" }}>

        {/* Status */}
        <div className="px-4 py-3 flex items-center gap-2.5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)" }} />
          <span className="text-[11px] font-500 text-text-2">Alfred · Online</span>
        </div>

        <div className="flex flex-col gap-3 p-3">
          {/* Needs you — flashing ship-alert console (urgent items only) */}
          {d.inbox && d.inbox.length > 0 && (
            <button
              onClick={() => navigateTo("/d/finances")}
              className="text-left rounded-[9px] p-2.5 border w-full"
              style={{ animation: "alert-flash 1.1s ease-in-out infinite" }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" style={{ animation: "alfred-pulse 1s ease-in-out infinite" }} />
                <span className="text-[10px] font-mono tracking-[0.18em] text-danger">NEEDS YOU</span>
              </div>
              <p className="text-[11px] font-mono text-text-2">{d.inbox.length} tx to review →</p>
            </button>
          )}

          {/* Tasks */}
          <Panel label="TASKS" delay={0}>
            {d.todos === null ? <Dim /> : d.todos.length === 0
              ? <p className="text-[10px] font-mono text-text-3">CLEAR</p>
              : <>
                  {d.todos.slice(0, 5).map((t: any) => (
                    <div key={t.id} className="flex items-start gap-2 py-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-sm mt-1 flex-shrink-0", t.done ? "bg-success" : "bg-[rgba(255,255,255,0.2)]")} />
                      <span className={cn("text-[10px] leading-snug truncate", t.done ? "line-through text-text-3" : "text-text-2")}>{t.text}</span>
                    </div>
                  ))}
                  <p className="text-[8px] font-mono text-text-3 mt-1">{d.todos.filter((t: any) => t.done).length}/{d.todos.length} done</p>
                </>
            }
          </Panel>

          {/* Streaks */}
          <Panel label="STREAKS" delay={80}>
            {!d.streaks ? <Dim /> : (
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { k: "workout", l: "WKT", v: cStreak0 },
                  { k: "video",   l: "VID", v: cStreak1 },
                  { k: "journal", l: "JRN", v: cStreak2 },
                  { k: "nf",      l: "NF",  v: cStreak3 },
                ] as const).map(s => {
                  const actual = d.streaks![s.k as keyof typeof d.streaks];
                  const c = s.v ?? actual;
                  return <div key={s.k} className="flex items-baseline gap-1">
                    <span className={cn("text-[20px] font-700 tabular-nums", actual > 0 ? "text-warning" : "text-text-3")}>
                      {c}
                    </span>
                    <span className={cn("text-[7px] font-mono tracking-wider", actual > 0 ? "text-warning opacity-60" : "text-text-3")}>{s.l}</span>
                  </div>;
                })}
              </div>
            )}
          </Panel>

          {/* Next event */}
          <Panel label="NEXT UP" delay={160}>
            {d.nextEvent
              ? <div>
                  <p className="text-[11px] font-600 text-text-1 leading-snug line-clamp-2">{d.nextEvent.title}</p>
                  <p className="text-[9px] font-mono text-accent mt-1">
                    {d.nextEvent.allDay ? "ALL DAY" : new Date(d.nextEvent.start).toLocaleString("en-US", { timeZone: tz(), weekday: "short", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              : <p className="text-[10px] font-mono text-text-3">CLEAR</p>
            }
          </Panel>

          {/* Finance */}
          <Panel label="NET WORTH" delay={240}>
            {d.netWorth === null ? <Dim /> : (
              <>
                <p className="text-[26px] font-800 tabular-nums font-mono leading-none"
                  style={{ color: d.netWorth >= 0 ? "#34d399" : "#f87171" }}>
                  {formatMoney(Math.abs(cNetWorth ?? d.netWorth), { decimals: 0 })}
                </p>
                {d.inbox && d.inbox.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <Inbox size={9} className="text-warning" />
                    <span className="text-[9px] font-mono text-warning">{d.inbox.length} TX pending</span>
                  </div>
                )}
              </>
            )}
          </Panel>

          {/* Voice mode */}
          <Panel label="VOICE" delay={320}>
            <button
              onClick={toggleVoice}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-[10px] font-mono transition-all",
                voiceLive
                  ? "bg-[rgba(167,139,250,0.1)] text-[#a78bfa] border border-[rgba(167,139,250,0.35)]"
                  : "bg-[rgba(255,255,255,0.03)] text-text-2 border border-[rgba(255,255,255,0.06)] hover:border-[rgba(29,155,240,0.3)] hover:text-accent"
              )}
              style={voiceLive ? { boxShadow: "0 0 12px rgba(167,139,250,0.18)" } : {}}
            >
              {voiceLive ? (
                <span className="flex items-center gap-2 w-full">
                  {/* Animated bars */}
                  <span className="flex items-end gap-[2px] h-3">
                    {[0,1,2,3].map(i => (
                      <span key={i} className="w-[3px] rounded-sm bg-[#a78bfa] origin-bottom"
                        style={{ height: "100%", animation: `alfred-bar-pulse ${0.5 + i * 0.1}s ease-in-out ${i * 0.12}s infinite` }} />
                    ))}
                  </span>
                  <span>{realtime.phase === "speaking" ? "SPEAKING" : realtime.phase === "listening" ? "LISTENING" : realtime.phase.toUpperCase()}</span>
                </span>
              ) : (
                <><Mic size={10} />LIVE VOICE</>
              )}
            </button>
            {voiceLive && (
              <button onClick={() => realtime.disconnect()} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-[9px] font-mono text-danger hover:bg-[rgba(248,113,113,0.08)] transition-colors mt-1">
                <PhoneOff size={9} />END
              </button>
            )}
          </Panel>

          {/* Guest mode */}
          <Panel label="IN THE ROOM" delay={400}>
            {guestMode ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0"
                    style={{ animation: "alfred-blink 2s ease-in-out infinite" }} />
                  <span className="text-[10px] font-mono text-warning truncate">
                    {guestName || "GUEST"}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setGuestMode(false);
                    setGuestName("");
                    const msg = "Guest session ended. Aaron is back.";
                    chatHistory.current.push({ role: "user", content: msg });
                  }}
                  className="w-full text-left text-[9px] font-mono text-text-3 hover:text-danger transition-colors px-1"
                >
                  END SESSION
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setGuestMode(true);
                  setGuestName("GUEST");
                  setChatOpen(true);
                  const msg = "[Aaron has handed the console to a guest. Greet them warmly — introduce yourself as Alfred, ask their name, check if you know them from the people directory, and keep sensitive financial/personal data private unless they're trusted.]";
                  setMsgs(p => [...p, { role: "assistant", content: "", streaming: true }]);
                  chatWith(
                    msg, chatHistory.current.slice(-4),
                    chunk => setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + chunk, streaming: true }; return copy; }),
                    url => navigateTo(url),
                    full => {
                      setMsgs(p => { const copy = [...p]; const last = copy[copy.length - 1]; if (last?.role === "assistant") copy[copy.length - 1] = { role: "assistant", content: full }; return copy; });
                      chatHistory.current.push({ role: "assistant", content: full });
                      if (!isDemoMode) speakRef.current(full);
                      const nameMatch = full.match(/(?:you are|you're|hi|hello),?\s+([A-Z][a-z]+)/);
                      if (nameMatch) setGuestName(nameMatch[1].toUpperCase());
                    },
                  );
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[7px] text-[10px] font-mono bg-[rgba(255,255,255,0.03)] text-text-2 border border-[rgba(255,255,255,0.06)] hover:border-[rgba(29,155,240,0.3)] hover:text-accent transition-all"
              >
                <span className="text-[10px]">⇄</span>HAND TO GUEST
              </button>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Center (orbital) ────────────────────────────── */}
      <div className="flex-1 flex flex-col relative z-10 min-w-0 py-4">
        {/* Perspective floor grid — the "looking out of the ship" depth cue */}
        <svg aria-hidden viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full" style={{ zIndex: 0, opacity: 0.55 }}>
          {[-160,-90,-40,0,40,90,160].map((dx,i) => (
            <line key={i} x1="160" y1="0" x2={160+dx*2.4} y2="200" stroke="rgba(62,176,255,0.16)" strokeWidth="1" />
          ))}
          {[0,42,90,144,200].map((y,i) => (
            <line key={`h${i}`} x1={160-(y*1.05)} y1={y} x2={160+(y*1.05)} y2={y} stroke="rgba(62,176,255,0.12)" strokeWidth="1" />
          ))}
        </svg>

        {/* Viewscreen — owns the vertical centre so the orb is ALWAYS centred,
            regardless of whether the chat panel is open. */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">

        {/* Bridge status strip */}
        <div className="relative z-10 flex items-center gap-2.5 mb-4 text-[9px] font-mono tracking-[0.22em]">
          <span className="text-accent">{config.brand.shortName.toUpperCase()}</span>
          <span className="flex items-center gap-1 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success" style={{ boxShadow: "0 0 6px rgba(52,211,153,0.6)" }} />NOMINAL</span>
          <span className="text-text-3">{dateStr}</span>
          <span className="text-text-2 tabular-nums tracking-normal">{time}</span>
          {d.inbox && d.inbox.length > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-danger" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)" }}>
              <span className="w-1 h-1 rounded-full bg-danger" style={{ animation: "alfred-pulse 1s ease-in-out infinite" }} />{d.inbox.length} NEED YOU
            </span>
          )}
        </div>

        <div className="relative z-10 w-full max-w-[400px] lg:max-w-[480px] aspect-square">
          {brainNodes !== null && brainNodes.length > 0 ? (
            <BrainGraph
              nodes={brainNodes}
              speaking={speaking || realtime.phase === "speaking"}
              audioLevel={realtime.audioLevel}
              onNodeClick={node => {
                const q =
                  node.type === "person"
                    ? `Who is ${node.name ?? node.label}? Remind me everything you know about them.`
                    : node.type === "video"
                    ? `Give me a quick status on "${node.label}" in the content pipeline — where are we and what's the next step?`
                    : `Tell me about this: "${node.content ?? node.label}"`;
                sendDirect(q);
              }}
            />
          ) : (
            <OrbitalSVG
              onNav={navigateTo}
              speaking={speaking || realtime.phase === "speaking"}
              audioLevel={realtime.audioLevel}
            />
          )}
        </div>
        </div>{/* /viewscreen */}

        {/* Bottom command console — anchored so it never shifts the orb */}
        <div className="relative z-10 flex-shrink-0 flex flex-col items-center w-full">

        {/* Omni command-line — type a command or ask Alfred (door #3) */}
        <div className="relative z-10 w-full max-w-[440px] mt-5 px-4">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-[11px]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(62,176,255,0.28)" }}>
            <span className="text-[10px] font-mono text-accent border border-[rgba(62,176,255,0.3)] rounded px-1 flex-shrink-0">⌘</span>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && input.trim()) send(); }}
              placeholder="Command, or ask Alfred anything…"
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-text-1 placeholder:text-text-3 p-0 min-w-0"
              style={{ boxShadow: "none" }}
            />
            <button onClick={toggleVoice} aria-label="Voice" className="flex-shrink-0 text-accent/70 hover:text-accent transition-colors"><Mic size={14} /></button>
          </div>
          <div className="flex gap-2 mt-2.5">
            {[
              { label: "What did I miss?", q: "what did I miss?" },
              { label: "Focus today",      q: "what should I focus on today?" },
              { label: "Sync views",       q: "sync my youtube views" },
              { label: "Run review",       q: "run my weekly review" },
            ].map(t => (
              <button key={t.label} onClick={() => sendDirect(t.q)}
                className="flex-1 text-center text-[10px] font-mono py-1.5 rounded-[8px] transition-all hover:text-accent"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop nav pills — shown in brain mode (replaces the orbital nav nodes) */}
        {brainNodes !== null && brainNodes.length > 0 && (
          <div className="hidden lg:flex mt-3 flex-wrap gap-1.5 justify-center px-4">
            {NODES.map(n => {
              const I = n.icon;
              return (
                <button key={n.id} onClick={() => navigateTo(n.href)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-mono border transition-all border-[rgba(255,255,255,0.07)] text-text-3 hover:border-[rgba(29,155,240,0.4)] hover:text-accent">
                  <I size={9} />{n.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Toggle chat — visible only on desktop when chat is closed */}
        {!chatOpen && msgs.length > 0 && (
          <button
            onClick={() => setChatOpen(true)}
            className="hidden lg:flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-full text-[9px] font-mono border border-[rgba(29,155,240,0.3)] text-accent hover:bg-[rgba(29,155,240,0.07)] transition-colors"
          >
            <Zap size={9} />OPEN CHAT
          </button>
        )}

        {/* Mobile node pills */}
        <div className="lg:hidden mt-4 flex flex-wrap gap-1.5 justify-center px-4">
          {NODES.map(n => {
            const I = n.icon;
            return (
              <button key={n.id} onClick={() => navigateTo(n.href)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[9px] font-mono border transition-all border-[rgba(255,255,255,0.07)] text-text-3 hover:border-[rgba(29,155,240,0.4)] hover:text-accent">
                <I size={9} />{n.label}
              </button>
            );
          })}
        </div>
        </div>{/* /bottom console */}
      </div>

      {/* ── Right (chat) — slides in when Alfred responds ── */}
      <div
        className="hidden lg:flex flex-col flex-shrink-0 relative z-10 overflow-hidden"
        style={{
          width: chatOpen ? "300px" : "0px",
          borderLeft: chatOpen ? "1px solid rgba(255,255,255,0.09)" : "none",
          transition: "width 0.35s cubic-bezier(.16,1,.3,1), border 0.35s",
        }}
      >

        {/* Chat header */}
        <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 min-w-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2 min-w-0">
            <Zap size={10} className="text-accent flex-shrink-0" />
            <span className="text-[9px] font-mono tracking-[0.25em] text-text-3 truncate">ALFRED · {brainLabel}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {msgs.length > 0 && (
              <button onClick={() => { setMsgs([]); chatHistory.current = []; }} className="text-[9px] font-mono text-text-3 hover:text-text-1 transition-colors">CLEAR</button>
            )}
            <button onClick={() => setChatOpen(false)} className="text-text-3 hover:text-text-1 transition-colors ml-1">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
          {msgs.length === 0 && (
            <div className="flex flex-col gap-2 mt-2">
              {(isDemoMode ? DEMO_ALFRED_PROMPTS : [
                "What did I miss?",
                "What should I focus on today?",
                "Run my weekly review",
                "Open my finances",
              ]).map(s => (
                <button key={s} onClick={() => { setInput(s); setTimeout(() => send(), 50); }}
                  className="px-3 py-2 rounded-[8px] text-[11px] text-text-3 text-left hover:text-text-1 transition-colors"
                  style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => {
            if (m.tool) {
              const ok = m.toolStatus === "done";
              return (
                <div key={i} className="flex items-center gap-1.5 pl-1">
                  <span className="text-[9px]" style={{ color: ok ? "rgba(52,211,153,0.8)" : "rgba(239,68,68,0.7)" }}>
                    {ok ? "✓" : "✗"}
                  </span>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded-full"
                    style={{
                      background: ok ? "rgba(52,211,153,0.07)" : "rgba(239,68,68,0.07)",
                      border: `1px solid ${ok ? "rgba(52,211,153,0.18)" : "rgba(239,68,68,0.18)"}`,
                      color: ok ? "rgba(52,211,153,0.75)" : "rgba(239,68,68,0.7)",
                    }}>
                    {m.tool.replace(/_/g, " ")}
                  </span>
                </div>
              );
            }
            return (
              <div key={i} className={cn("flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}>
                {m.role === "assistant" && (
                  <span className="text-[8px] font-mono tracking-[0.22em] ml-1" style={{ color: "rgba(29,155,240,0.55)" }}>ALFRED</span>
                )}
                <div className={cn(
                  "px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap max-w-[90%]",
                  m.role === "user"
                    ? "rounded-[10px] bg-accent-dim text-text-1 border border-[rgba(29,155,240,0.22)]"
                    : "rounded-[10px] rounded-tl-[3px] text-text-2"
                )}
                style={m.role === "assistant" ? {
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderLeft: "1.5px solid rgba(29,155,240,0.38)",
                } : {}}>
                  {m.content || (m.streaming ? "" : "…")}
                  {m.streaming && (
                    <span className="inline-block w-[5px] h-[11px] bg-accent ml-0.5 rounded-sm align-middle"
                      style={{ animation: "alfred-blink 0.7s step-end infinite" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Live voice indicator */}
          {voiceLive && (
            <div className="mb-2 px-3 py-2 rounded-[8px] flex items-center gap-2"
              style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)" }}>
              <div className="w-2 h-2 rounded-full bg-[#a78bfa]" style={{ animation: "alfred-pulse 1s ease-in-out infinite" }} />
              <span className="text-[10px] font-mono text-[#a78bfa] flex-1 truncate">
                {realtime.phase === "speaking" ? realtime.partialAlfred || "Speaking…" : realtime.partialUser || "Listening…"}
              </span>
              <button onClick={realtime.toggleMute} className="text-text-3 hover:text-text-1 transition-colors">
                {realtime.muted ? <MicOff size={11} /> : <Mic size={11} />}
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder="Ask Alfred…"
              disabled={busy}
              className="flex-1 px-3 py-2 text-[12px] resize-none max-h-24 min-h-[36px] rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] text-text-1 placeholder:text-text-3 focus:outline-none focus:border-[rgba(29,155,240,0.3)] transition-colors"
            />
            <button
              onClick={toggleVoice}
              className={cn(
                "w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 border transition-all",
                voiceLive
                  ? "bg-[rgba(167,139,250,0.15)] border-[rgba(167,139,250,0.4)] text-[#a78bfa]"
                  : "border-[rgba(255,255,255,0.08)] text-text-3 hover:text-accent hover:border-[rgba(29,155,240,0.3)]"
              )}
            >
              <Mic size={13} />
            </button>
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-shrink-0 disabled:opacity-30 transition-opacity"
              style={{ background: "rgba(29,155,240,0.15)", border: "1px solid rgba(29,155,240,0.3)" }}
            >
              <Send size={12} className="text-accent" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile chat strip */}
      <div className="lg:hidden absolute bottom-0 left-0 right-0 z-20 flex flex-col"
        style={{ background: "rgba(2,5,9,0.95)", borderTop: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(20px)" }}>
        {msgs.length > 0 && (
          <div className="px-4 py-2 max-h-28 overflow-y-auto">
            {msgs.slice(-2).map((m, i) => (
              <p key={i} className={cn("text-[12px] leading-relaxed", m.role === "user" ? "text-text-2 text-right" : "text-text-2")}>{m.content}</p>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2.5">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1}
            placeholder="Ask Alfred…"
            disabled={busy}
            className="flex-1 px-3 py-2 text-[13px] resize-none rounded-[8px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] text-text-1 placeholder:text-text-3 focus:outline-none"
          />
          <button onClick={toggleVoice} className={cn("w-10 h-10 rounded-[8px] flex items-center justify-center border flex-shrink-0 transition-all", voiceLive ? "bg-[rgba(167,139,250,0.15)] border-[rgba(167,139,250,0.4)] text-[#a78bfa]" : "border-[rgba(255,255,255,0.08)] text-text-3")}>
            <Mic size={14} />
          </button>
          <button onClick={send} disabled={busy || !input.trim()} className="w-10 h-10 rounded-[8px] flex items-center justify-center flex-shrink-0 disabled:opacity-30" style={{ background: "rgba(29,155,240,0.15)", border: "1px solid rgba(29,155,240,0.3)" }}>
            <Send size={13} className="text-accent" />
          </button>
        </div>
      </div>

    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────
function Panel({ label, children, delay = 0 }: { label: string; children: any; delay?: number }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-[12px] animate-fade-up"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.025) 100%)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderTop: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.28)",
        backdropFilter: "blur(16px)",
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
      }}>
      <p className="text-[10px] font-700 uppercase tracking-[0.14em] text-text-3">{label}</p>
      <div>{children}</div>
    </div>
  );
}
function Dim() { return <div className="h-3 w-16 rounded bg-[rgba(29,155,240,0.08)] animate-pulse" />; }
