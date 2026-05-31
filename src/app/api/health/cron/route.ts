// GET /api/health/cron
// Returns the most-recent run status for each known cron job, plus a flag
// indicating which are stale (>36h since last success).
// Owner-only. Used by the Settings → Health page.
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { getLatestCronRuns, getStaleCronJobs } from "@/lib/cronTelemetry";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;

  try {
    const [latest, stale] = await Promise.all([
      getLatestCronRuns(),
      getStaleCronJobs(36),
    ]);
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      jobs: latest,
      stale,
    });
  } catch (err) {
    captureError(err, { area: "health", action: "cron_status", route: "/api/health/cron" });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
