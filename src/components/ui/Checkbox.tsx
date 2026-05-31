"use client";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

export function Checkbox({ checked, onChange, disabled, className, label }: CheckboxProps) {
  return (
    <label className={cn("flex items-center gap-3 cursor-pointer group", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "w-5 h-5 rounded-[7px] border flex items-center justify-center flex-shrink-0",
          "transition-all duration-200 ease-[var(--ease-spring)]",
          "active:scale-90",
          checked
            ? "bg-gradient-to-b from-[#3eb0ff] to-[#1D9BF0] border-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_0_10px_rgba(29,155,240,0.55)]"
            : "border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.02)] hover:border-accent hover:bg-[rgba(29,155,240,0.06)]"
        )}
        style={checked ? { animation: "check-pop 0.32s var(--ease-spring)" } : undefined}
      >
        {checked && <Check size={12} strokeWidth={3} className="text-black" />}
      </button>
      {label && (
        <span className={cn("text-[13px] transition-all duration-200", checked ? "text-text-3 line-through" : "text-text-1")}>
          {label}
        </span>
      )}
    </label>
  );
}
