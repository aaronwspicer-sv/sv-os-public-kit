"use client";
// Alfred cockpit — the single place to run Alfred. Autonomy + kill switch, the
// "what I did" feed + approvals, his memory + identity, and a health link.
// Consolidates what used to be scattered across Settings and the orphaned
// /d/activity page.
import { useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, Brain, Sparkles, Activity as ActivityIcon, HeartPulse } from "lucide-react";
import { AlfredAutonomyToggle } from "@/components/settings/AlfredAutonomyToggle";
import { AlfredKillSwitch } from "@/components/settings/AlfredKillSwitch";
import { AlfredMemories } from "@/components/settings/AlfredMemories";
import { SvGptEditor } from "@/components/settings/SvGptEditor";
import { AlfredActivityFeed } from "@/components/alfred/AlfredActivityFeed";
import { useDemoMode } from "@/components/ui/DemoModeContext";

function Section({ icon: Icon, title, children, defaultOpen = true }: {
  icon: any; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full mb-3 group">
        <span className="flex items-center gap-2 text-[12px] font-700 uppercase tracking-[0.16em] text-text-2">
          <Icon size={14} className="text-accent" /> {title}
        </span>
        <ChevronDown size={15} className={`text-text-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="animate-fade-up">{children}</div>}
    </div>
  );
}

export default function AlfredCockpitPage() {
  const { isDemoMode } = useDemoMode();

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-xl font-700 flex items-center gap-2">
          <Bot size={18} className="text-accent" /> Alfred
        </h1>
        <p className="text-text-3 text-[13px] mt-1">
          Your AI's cockpit — what he does on his own, what he knows, and the switches that govern him.
        </p>
      </div>

      <Section icon={Sparkles} title="Controls">
        <div className="space-y-3">
          <AlfredAutonomyToggle />
          <AlfredKillSwitch />
        </div>
      </Section>

      <Section icon={ActivityIcon} title="Activity">
        <AlfredActivityFeed />
      </Section>

      <Section icon={Sparkles} title="Identity" defaultOpen={false}>
        {isDemoMode
          ? <p className="text-text-3 text-[12px]">Alfred's identity editor is hidden in demo mode.</p>
          : <SvGptEditor />}
      </Section>

      <Section icon={Brain} title="Memory" defaultOpen={false}>
        {isDemoMode
          ? <p className="text-text-3 text-[12px]">Alfred's memories are hidden in demo mode.</p>
          : <AlfredMemories />}
      </Section>

      <Section icon={HeartPulse} title="Health" defaultOpen={false}>
        <p className="text-text-3 text-[13px]">
          System status — cron jobs, integrations, and setup checks live on the{" "}
          <Link href="/d/settings/health" className="text-accent underline">health page</Link>.
        </p>
      </Section>
    </div>
  );
}
