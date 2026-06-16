// The autonomous pass orchestrator. One "heartbeat" of Autonomous Alfred:
//   gate (autonomy on + not panic-disabled) → gather state → reader (plan) →
//   executor (run green only) → push digest.
// Runs from the agent-pass cron. Gated so it does NOTHING unless the owner has
// explicitly opted in via autonomy_enabled.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gatherUserData } from "@/lib/brief/userData";
import { detectPatterns } from "../autonomous";
import { isAutonomyEnabled } from "../autonomyState";
import { requireAlfredEnabled } from "../killSwitch";
import { sendPushToUser } from "@/lib/push";
import { redactForEgress } from "../egress";
import { readPlan, type PassKind } from "./reader";
import { executePlan } from "./executor";
import { runSelfDoc } from "./selfDoc";

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface PassOutcome {
  skipped: boolean;
  reason?: string;
  executed?: number;
  queued?: number;
  failed?: number;
  digest?: string;
}

export async function runAgentPass(userId: string, pass: PassKind): Promise<PassOutcome> {
  const sb = admin();

  // Gate 1 — panic switch. If Alfred is disabled entirely, do nothing.
  const kill = await requireAlfredEnabled(sb, userId);
  if (!kill.ok) return { skipped: true, reason: "alfred_disabled" };

  // Gate 2 — autonomy opt-in. Off by default; the loop only acts when on.
  if (!(await isAutonomyEnabled(sb, userId))) return { skipped: true, reason: "autonomy_off" };

  // Assess.
  const data = await gatherUserData(userId);
  const patterns = detectPatterns(data);

  // Plan (reader — no action tools) then execute (executor — green only).
  const plan = await readPlan(sb, userId, data, patterns, pass);
  const result = await executePlan(sb, userId, plan.actions);

  // Self-documenting engine — evening only. Turns today's build material into a
  // content draft (green). Folded into the digest.
  let selfDocLine = "";
  if (pass === "evening") {
    const sd = await runSelfDoc(sb, userId, data).catch(() => ({ drafted: 0, digest: "" }));
    if (sd.digest) selfDocLine = sd.digest;
  }

  // Report. Push the digest if there's something to say.
  const digest = [
    plan.digest || (result.executed > 0
      ? `${result.executed} thing${result.executed === 1 ? "" : "s"} handled this ${pass} pass.`
      : ""),
    selfDocLine,
  ].filter(Boolean).join(" · ");
  if (digest) {
    // Egress wall — even a push to the owner's own device is outbound; never
    // let a stray credential or sensitive figure ride out in a notification.
    await sendPushToUser(userId, {
      title: "🤖 Alfred — autonomous pass",
      body: redactForEgress(digest),
      url: "/d/alfred",
      tag: "agent-pass",
    }, sb).catch(() => {});
  }

  return { skipped: false, ...result, digest };
}
