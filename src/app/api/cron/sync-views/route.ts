// On-demand YouTube → Notion view sync, behind the "Sync views" button in
// the Command tab. The SCHEDULED daily run lives inside the evening-recap
// cron (free Vercel caps us at 2 cron jobs), so this route is owner-only and
// carries no cron telemetry — it just does the work and reports counts.
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { syncYoutubeViews } from "@/lib/syncViews";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: NextRequest) {
  // Owner session, or the legacy x-cron-secret for a manual curl.
  const cronSecret = process.env.CRON_SECRET;
  const xCronSecret = req.headers.get("x-cron-secret");
  if (!(cronSecret && xCronSecret === cronSecret)) {
    const gate = await requireOwner();
    if (!gate.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const res = await syncYoutubeViews();
    return NextResponse.json({ ok: true, ...res });
  } catch (err: any) {
    captureError(err, { area: "cron", action: "sync_views_manual" });
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
