import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize    = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-[#3eb0ff] to-[#1D9BF0] text-black font-600 " +
    "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_2px_8px_rgba(29,155,240,0.35)] " +
    "hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_4px_14px_rgba(29,155,240,0.5)] " +
    "hover:from-[#52baff] hover:to-[#2aa6f5]",
  ghost:
    "bg-transparent text-text-2 hover:bg-[rgba(255,255,255,0.06)] hover:text-text-1",
  outline:
    "bg-[rgba(255,255,255,0.02)] border border-border-dim text-text-1 " +
    "hover:border-[rgba(29,155,240,0.4)] hover:text-accent hover:bg-[rgba(29,155,240,0.04)]",
  danger:
    "bg-[rgba(248,113,113,0.10)] border border-[rgba(248,113,113,0.25)] text-danger " +
    "hover:bg-[rgba(248,113,113,0.18)] hover:border-[rgba(248,113,113,0.4)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3   py-1.5 text-[12px] rounded-[10px]",
  md: "px-4   py-2   text-[13px] rounded-[12px]",
  lg: "px-5   py-2.5 text-[14px] rounded-[14px]",
};

export function Button({
  className, variant = "ghost", size = "md", loading, disabled, children, ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-500",
        "transition-all duration-200 ease-[var(--ease-glide)]",
        "active:scale-[0.97] active:transition-transform active:duration-75",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </span>
      ) : children}
    </button>
  );
}
