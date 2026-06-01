"use client";

interface LogEntry {
  workout: boolean; nf: boolean; postedVideo: boolean;
  reflectedJournal: boolean; hoursWorked: number;
}
interface Streaks { workout: number; video: number; journal: number; nf: number; }
interface Props { logEntry: LogEntry | null; streaks: Streaks | null; loading?: boolean; }

function computeGpa(e: LogEntry, s: Streaks) {
  const workoutPts = e.workout ? 20 : 0;
  const nfPts      = e.nf ? 15 : 0;
  const videoPts   = e.postedVideo ? 15 : 0;
  const journalPts = e.reflectedJournal ? 15 : 0;
  const workPts    = Math.min(e.hoursWorked / 8, 1) * 20;
  const streakPts  = Math.min((s.workout + s.video + s.journal + s.nf) / 40, 1) * 15;
  const score      = workoutPts + nfPts + videoPts + journalPts + workPts + streakPts;
  const grade =
    score >= 95 ? "A+" : score >= 90 ? "A"  : score >= 85 ? "A−" :
    score >= 80 ? "B+" : score >= 75 ? "B"  : score >= 70 ? "B−" :
    score >= 65 ? "C+" : score >= 60 ? "C"  : score >= 50 ? "D"  : "F";
  return {
    score, grade,
    breakdown: [
      { label: "Workout", pts: workoutPts, max: 20 },
      { label: "NF",      pts: nfPts,      max: 15 },
      { label: "Video",   pts: videoPts,   max: 15 },
      { label: "Journal", pts: journalPts, max: 15 },
      { label: "Work",    pts: workPts,    max: 20 },
      { label: "Streaks", pts: streakPts,  max: 15 },
    ],
  };
}

function gradeColor(g: string) {
  if (g.startsWith("A")) return "#34d399";
  if (g.startsWith("B")) return "#1d9bf0";
  if (g.startsWith("C")) return "#fbbf24";
  return "#f87171";
}

export function LifeGpaCard({ logEntry, streaks, loading }: Props) {
  if (loading) return (
    <div className="h-[100px] flex items-center justify-center">
      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!logEntry || !streaks) return (
    <p className="text-[11px] text-text-3 italic">No log data yet.</p>
  );

  const { score, grade, breakdown } = computeGpa(logEntry, streaks);
  const color = gradeColor(grade);
  const R = 28, C = 2 * Math.PI * R;

  return (
    <div className="flex items-center gap-4">
      {/* Ring */}
      <div className="relative flex-shrink-0 w-[72px] h-[72px]">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
          <circle
            cx="36" cy="36" r={R} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${C * score / 100} ${C * (1 - score / 100)}`}
            strokeDashoffset={C * 0.25} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}60)`, transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[14px] font-800" style={{ color }}>{grade}</span>
        </div>
      </div>

      {/* Score + breakdown */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[26px] font-700 tabular-nums" style={{ color }}>{score.toFixed(0)}</span>
          <span className="text-[11px] text-text-3">/ 100 today</span>
        </div>
        <div className="flex flex-col gap-1">
          {breakdown.map(b => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-[10px] text-text-3 w-[52px] flex-shrink-0">{b.label}</span>
              <div className="flex-1 h-[3px] bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(b.pts / b.max) * 100}%`, background: color, opacity: 0.75 }}
                />
              </div>
              <span className="text-[10px] text-text-3 tabular-nums w-7 text-right">{Math.round(b.pts)}/{b.max}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
