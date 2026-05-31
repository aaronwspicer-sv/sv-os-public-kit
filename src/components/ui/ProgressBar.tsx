import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  segments?: number;
  className?: string;
  color?: "accent" | "success" | "warning";
}

const colorMap = {
  accent:  { bar: "linear-gradient(90deg, #1D9BF0 0%, #3eb0ff 100%)", solid: "#1D9BF0", glow: "rgba(29,155,240,0.5)" },
  success: { bar: "linear-gradient(90deg, #34d399 0%, #6ee7b7 100%)", solid: "#34d399", glow: "rgba(52,211,153,0.5)" },
  warning: { bar: "linear-gradient(90deg, #fbbf24 0%, #fcd34d 100%)", solid: "#fbbf24", glow: "rgba(251,191,36,0.5)" },
};

export function ProgressBar({ value, segments, className, color = "accent" }: ProgressBarProps) {
  const c = colorMap[color];
  const clamped = Math.max(0, Math.min(100, value));

  if (segments && segments > 0) {
    const filled = Math.round((clamped / 100) * segments);
    return (
      <div className={cn("flex gap-1 h-1.5", className)}>
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-500 ease-[var(--ease-glide)]"
            style={{
              background: i < filled ? c.bar : "rgba(255,255,255,0.06)",
              boxShadow: i < filled ? `0 0 8px ${c.glow}` : "none",
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden relative", className)}>
      <div
        className="h-full rounded-full transition-all duration-700 ease-[var(--ease-glide)] relative"
        style={{
          width: `${clamped}%`,
          background: c.bar,
          boxShadow: `0 0 12px ${c.glow}`,
        }}
      >
        {/* Leading edge highlight */}
        <div
          className="absolute top-0 right-0 h-full w-3"
          style={{
            background: `linear-gradient(90deg, transparent, ${c.solid})`,
            filter: `drop-shadow(0 0 6px ${c.glow})`,
            opacity: clamped > 0 && clamped < 100 ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
