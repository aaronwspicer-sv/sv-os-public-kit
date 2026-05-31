import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  variant?: "default" | "success" | "warning" | "danger" | "highlight";
  interactive?: boolean;
}

export function Card({ className, glow, variant = "default", interactive, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "glass p-5 transition-all duration-300 ease-[var(--ease-glide)]",
        interactive && "hover:scale-[1.005] hover:border-[rgba(29,155,240,0.28)] hover:shadow-[0_0_24px_rgba(29,155,240,0.12)] cursor-pointer",
        glow && "shadow-[0_0_28px_rgba(29,155,240,0.18)]",
        variant === "success"   && "border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.04)]",
        variant === "warning"   && "border-[rgba(251,191,36,0.22)] bg-[rgba(251,191,36,0.04)]",
        variant === "danger"    && "border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.04)]",
        variant === "highlight" && "border-[rgba(29,155,240,0.28)] bg-[rgba(29,155,240,0.05)]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[11px] font-700 uppercase tracking-[0.16em] text-text-2", className)} {...props}>
      {children}
    </p>
  );
}
