import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { wrap: "py-5 gap-2",  iconBox: "w-9 h-9 rounded-[12px]", iconSize: 16, title: "text-[12px]", body: "text-[11px]" },
  md: { wrap: "py-8 gap-3",  iconBox: "w-12 h-12 rounded-[14px]", iconSize: 20, title: "text-[14px]", body: "text-[12px]" },
  lg: { wrap: "py-12 gap-4", iconBox: "w-16 h-16 rounded-[18px]", iconSize: 26, title: "text-[16px]", body: "text-[13px]" },
} as const;

export function EmptyState({ icon: Icon, title, body, action, className, size = "md" }: EmptyStateProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex flex-col items-center justify-center text-center px-4", s.wrap, className)}>
      {Icon && (
        <div className={cn(
          "bg-[rgba(255,255,255,0.03)] border border-border-dim flex items-center justify-center text-text-3",
          s.iconBox
        )}>
          <Icon size={s.iconSize} strokeWidth={1.75} />
        </div>
      )}
      <div className="flex flex-col gap-1 max-w-[280px]">
        <p className={cn("font-600 text-text-2", s.title)}>{title}</p>
        {body && <p className={cn("text-text-3 leading-relaxed", s.body)}>{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
