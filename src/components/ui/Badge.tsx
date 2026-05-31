import { cn } from "@/lib/utils";

type BadgeVariant = "accent" | "success" | "warning" | "danger" | "muted" | "streak";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  accent:  "bg-[rgba(29,155,240,0.13)]  text-accent  border border-[rgba(29,155,240,0.28)]  shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  success: "bg-[rgba(52,211,153,0.11)]  text-success border border-[rgba(52,211,153,0.24)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  warning: "bg-[rgba(251,191,36,0.11)]  text-warning border border-[rgba(251,191,36,0.24)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  danger:  "bg-[rgba(248,113,113,0.11)] text-danger  border border-[rgba(248,113,113,0.24)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  muted:   "bg-[rgba(255,255,255,0.04)] text-text-2  border border-border-dim",
  streak:  "bg-[rgba(251,191,36,0.10)]  text-[#fbbf24] border border-[rgba(251,191,36,0.24)] animate-streak",
};

export function Badge({ className, variant = "muted", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-600 uppercase tracking-wide",
        "transition-all duration-200",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
