"use client";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { Moon, Sun, Laptop, Palette } from "lucide-react";

const OPTIONS: { value: Theme; label: string; icon: typeof Moon }[] = [
  { value: "light",  label: "Light",  icon: Sun },
  { value: "dark",   label: "Dark",   icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export function ThemeToggle() {
  const { theme, setTheme, resolved } = useTheme();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette size={14} className="text-accent" />
          <CardTitle>Appearance</CardTitle>
        </div>
        <span className="text-[11px] text-text-3">Currently {resolved}</span>
      </CardHeader>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-[12px] border transition-all duration-200 ease-[var(--ease-glide)] ${
                active
                  ? "bg-[rgba(29,155,240,0.10)] border-[rgba(29,155,240,0.32)] text-accent shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  : "bg-[rgba(255,255,255,0.02)] border-border-dim text-text-2 hover:border-border hover:text-text-1"
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.4 : 2} />
              <span className="text-[11px] font-600">{label}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
