// Tiny telemetry layer that every cron handler wraps itself with so
// /api/health/cron can answer "is the morning brief still firing?"
//
// Usage at the top of a cron handler:
//   const t = startCronRun("morning-brief");
//   try {
//     // …work…
//     await t.success({ sentTo: ownerIds.length });
//   } catch (err) {
//     await t.failure(err);
//     throw err;
//   }
//
// Falls back to console-only if the service-role client can't reach
// Supabase (network blip / misconfig) — we never want telemetry failure
// to kill the actual cron work.
import { createClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/sentry";

const KNOWN_JOBS = ["morning-brief", "evening-recap", "audit-log-retention"] as const;
export type CronJobName = typeof KNOWN_JOBS[number];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface CronRunHandle {
  success: (metadata?: Record<string, unknown>) => Promise<void>;
  failure: (err: unknown, metadata?: Record<string, unknown>) => Promise<void>;
  partial: (metadata: Record<string, unknown>) => Promise<void>;
}

export function startCronRun(jobName: CronJobName): CronRunHandle {
  const startMs = Date.now();
  const sb = admin();

  async function record(
    status: "success" | "failure" | "partial",
    payload: Record<string, unknown> = {},
    error?: unknown,
  ) {
    const durationMs = Date.now() - startMs;
    try {
      await sb.from("cron_runs").insert({
        job_name: jobName,
        status,
        duration_ms: durationMs,
        error: error instanceof Error ? error.message.slice(0, 600) : null,
        metadata: payload,
      });
    } catch (err) {
      // Telemetry write failed — log to Sentry but don't bubble. The cron's
      // actual work has already either succeeded or failed; recording it is
      // best-effort.
      captureError(err, { area: "cron", action: "telemetry_insert_failed", extra: { jobName, status } });
    }
  }

  return {
    success: (metadata) => record("success", metadata ?? {}),
    failure: (err, metadata) => record("failure", metadata ?? {}, err),
    partial: (metadata) => record("partial", metadata),
  };
}

/**
 * Look up the most recent run per job. Used by /api/health/cron and the
 * morning brief's stale-cron check.
 */
export async function getLatestCronRuns(): Promise<Record<string, {
  status: string;
  ranAt: string;
  durationMs: number | null;
  error: string | null;
  ageSeconds: number;
}>> {
  const sb = admin();
  const { data } = await sb
    .from("cron_runs")
    .select("job_name, status, ran_at, duration_ms, error")
    .order("ran_at", { ascending: false });
  if (!data) return {};
  const latest: Record<string, any> = {};
  for (const row of data) {
    if (latest[row.job_name]) continue; // already kept the most recent
    latest[row.job_name] = {
      status: row.status,
      ranAt: row.ran_at,
      durationMs: row.duration_ms,
      error: row.error,
      ageSeconds: Math.round((Date.now() - new Date(row.ran_at).getTime()) / 1000),
    };
  }
  return latest;
}

export interface StaleJob {
  name: string;
  ageHours: number | null;
  status: string | null;
}

/** Returns the list of known jobs that haven't run successfully in `maxAgeHours`. */
export async function getStaleCronJobs(maxAgeHours = 36): Promise<StaleJob[]> {
  const latest = await getLatestCronRuns();
  const cutoffSec = maxAgeHours * 3600;
  const out: StaleJob[] = [];
  for (const name of KNOWN_JOBS) {
    const r = latest[name];
    if (!r) { out.push({ name, ageHours: null, status: null }); continue; }     // never run
    if (r.status !== "success") { out.push({ name, ageHours: r.ageSeconds / 3600, status: r.status }); continue; }
    if (r.ageSeconds > cutoffSec) { out.push({ name, ageHours: r.ageSeconds / 3600, status: "stale" }); }
  }
  return out;
}
