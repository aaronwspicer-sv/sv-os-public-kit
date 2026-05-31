import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "pill" | "full";
}

const roundedMap = {
  sm:   "rounded-[6px]",
  md:   "rounded-[10px]",
  lg:   "rounded-[14px]",
  pill: "rounded-[999px]",
  full: "rounded-full",
} as const;

export function Skeleton({ className, width, height, rounded = "md", style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", roundedMap[rounded], className)}
      style={{ width, height, ...style }}
      {...props}
    />
  );
}

// Convenience: row of N skeleton lines stacked
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} width={i === lines - 1 ? "70%" : "100%"} />
      ))}
    </div>
  );
}

// Convenience: list of N rows that look like account/todo entries
export function SkeletonRows({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] bg-[rgba(255,255,255,0.02)]">
          <Skeleton width={8} height={8} rounded="full" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton width="60%" height={11} />
            <Skeleton width="40%" height={9} />
          </div>
          <Skeleton width={60} height={14} />
        </div>
      ))}
    </div>
  );
}
