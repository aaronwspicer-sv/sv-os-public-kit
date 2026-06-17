import type { ReactNode } from "react";

type Status = "online" | "warn" | "alert" | null;

const DOT: Record<"online" | "warn" | "alert", string> = {
  online: "#34d399",
  warn:   "#fbbf24",
  alert:  "#f87171",
};

/**
 * The console header shared by every room — the "station" identity that makes
 * the whole OS feel like one ship. A telemetry eyebrow + status LED, a readable
 * title, an optional sub-line and action, and a thin accent rule beneath.
 *
 *   station  — short mono-uppercase callsign (e.g. "GOALS", "FINANCE")
 *   title    — the readable room title (sans)
 */
export function StationHeader({
  station, title, sub, status = "online", action,
}: {
  station: string;
  title: ReactNode;
  sub?: ReactNode;
  status?: Status;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 animate-fade-up">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {status && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: DOT[status], boxShadow: `0 0 6px ${DOT[status]}99` }} />
            )}
            <span className="telemetry">{station}</span>
          </div>
          <h1 className="text-[24px] font-700 tracking-tight leading-tight truncate">{title}</h1>
          {sub && <div className="text-text-3 text-[13px] mt-1">{sub}</div>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className="mt-3 h-px w-full"
        style={{ background: "linear-gradient(90deg, rgba(29,155,240,0.4), rgba(29,155,240,0.06) 55%, transparent)" }} />
    </div>
  );
}
