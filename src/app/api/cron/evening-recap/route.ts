// Vercel cron — fires at 01:00 UTC = 9pm EDT / 8pm EST Toronto.
// Sends the evening recap email + a journal-nudge push if no log entry yet.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { gatherUserData } from "@/lib/brief/userData";
import { renderEveningRecap } from "@/lib/brief/render";
import { sendPushToUser } from "@/lib/push";
import { requireOwner } from "@/lib/auth";
import { generateAlfredReview } from "@/lib/alfred/autonomous";
import { runAgentPass } from "@/lib/alfred/agent/loop";
import { runWorldMonitor } from "@/lib/alfred/agent/worldMonitor";
import { createClient } from "@supabase/supabase-js";
import { torontoDayOfWeek } from "@/lib/torontoDay";
import { startCronRun } from "@/lib/cronTelemetry";
import { captureError } from "@/lib/sentry";
import { archiveOldAuditRows } from "@/lib/auditRetention";
import { syncYoutubeViews } from "@/lib/syncViews";
import { config } from "@/config";

// Same reason as morning-brief: 10s default → 60s. Sundays also do the
// Alfred Coach Review which calls gpt-4o (can take 10-15s alone).
export const runtime = "nodejs";
export const maxDuration = 60;

const ALFRED_REVIEW_DOW = 0; // 0=Sun in Toronto. Run alongside evening recap.

function renderAlfredReviewEmail(name: string, review: string): { subject: string; html: string } {
  const date = new Date().toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone });
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#000;color:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#000;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:540px;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:20px;">
        <tr><td style="padding:24px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">✦ Sunday Review · from Alfred</div>
          <div style="font-size:26px;font-weight:700;color:#fafafa;margin-top:6px;line-height:1.15;">${date}</div>
          <div style="margin-top:20px;padding:18px;border-radius:14px;background:linear-gradient(135deg,rgba(29,155,240,0.10),rgba(167,139,250,0.08));border:1px solid rgba(167,139,250,0.30);">
            <div style="font-size:14px;color:#fafafa;line-height:1.6;white-space:pre-wrap;">${review.replace(/</g,"&lt;")}</div>
          </div>
          <div style="margin-top:24px;text-align:center;">
            <a href="${config.brand.appUrl}/d" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(180deg,#3eb0ff,#1d9bf0);color:#000;font-weight:700;text-decoration:none;font-size:13px;">Open ${config.brand.shortName} →</a>
          </div>
        </td></tr>
      </table>
      <div style="margin-top:14px;font-size:10px;color:#6b7280;letter-spacing:1px;text-transform:uppercase;">${config.brand.name} · Alfred</div>
    </td></tr>
  </table>
</body></html>`;
  return {
    subject: `✦ Sunday review — Alfred for ${name}`,
    html,
  };
}

const OWNER_USER_IDS_ENV = process.env.OWNER_USER_IDS?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
const ALERT_EMAIL        = config.owner.alertEmail;
const OWNER_NAME         = config.owner.name;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function resolveOwnerIds(sb: ReturnType<typeof admin>): Promise<string[]> {
  if (OWNER_USER_IDS_ENV.length > 0) return OWNER_USER_IDS_ENV;
  try {
    const { data } = await sb.auth.admin.listUsers({ perPage: 1 });
    return (data?.users ?? []).map((u: any) => u.id);
  } catch {
    return [];
  }
}

async function authorize(req: NextRequest): Promise<{ ok: true; isPreview: boolean } | NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  // Same fix as morning-brief — Vercel cron sends `Authorization: Bearer …`,
  // not the custom headers the old code was checking. See morning-brief
  // for the full explanation.
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const xCronSecret = req.headers.get("x-cron-secret"); // legacy / manual-curl path
  const ua = req.headers.get("user-agent") ?? "";
  if (cronSecret && (bearer === cronSecret || xCronSecret === cronSecret)) {
    return { ok: true, isPreview: false };
  }
  if (!cronSecret && ua.toLowerCase().startsWith("vercel-cron")) {
    return { ok: true, isPreview: false };
  }
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { ok: true, isPreview: true };
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  const telemetry = startCronRun("evening-recap");
  if (!process.env.RESEND_API_KEY) {
    await telemetry.failure(new Error("Resend not configured"));
    return NextResponse.json({ error: "Resend not configured" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent: string[] = [];
  const errors: string[] = [];
  const sb = admin();

  const ownerIds = await resolveOwnerIds(sb);

  for (const uid of ownerIds) {
    try {
      const data = await gatherUserData(uid);
      const { subject, html } = renderEveningRecap({ name: OWNER_NAME, data });

      await resend.emails.send({
        from: config.brand.emailFrom,
        to:   ALERT_EMAIL,
        subject,
        html,
      });
      sent.push(uid);

      // Journal nudge push if today is unlogged
      if (!data.todayLog) {
        sendPushToUser(uid, {
          title: "✍️ Don't let today slip",
          body:  "90 seconds to log what happened. Future-you thanks you.",
          url:   "/d/entry",
          tag:   "evening-journal",
          requireInteraction: true,
        }, sb).catch(() => {});
      }

      // Sunday: also fire the Alfred coach review email
      if (torontoDayOfWeek() === ALFRED_REVIEW_DOW) {
        try {
          const review = await generateAlfredReview(uid);
          if (review) {
            const out = renderAlfredReviewEmail(OWNER_NAME, review);
            await resend.emails.send({
              from: config.brand.emailFrom,
              to:   ALERT_EMAIL,
              subject: out.subject,
              html:    out.html,
            });
            sendPushToUser(uid, {
              title: "✦ Alfred's Sunday Review is in",
              body:  review.slice(0, 120) + (review.length > 120 ? "…" : ""),
              url:   "/d",
              tag:   "alfred-review",
            }, sb).catch(() => {});
          }
        } catch (err: any) {
          console.error("alfred review failed for", uid, err?.message);
        }
      }

      // Ride-along: the evening autonomous pass (includes the self-documenting
      // engine). Free Vercel allows only 2 cron jobs, so the agent loop runs
      // inside the recap. No-op unless autonomy_enabled is on.
      await runAgentPass(uid, "evening").catch(() => {});
    } catch (err: any) {
      errors.push(`${uid}: ${err?.message ?? "unknown"}`);
      captureError(err, { area: "cron", action: "evening_recap_for_user", route: "/api/cron/evening-recap", userId: uid });
    }
  }

  // Weekly ride-along: world-monitor runs once a week (Tuesday, Toronto) inside
  // the evening recap rather than burning a third cron slot. Best-effort.
  if (torontoDayOfWeek() === 2 && ownerIds.length > 0) {
    try {
      await runWorldMonitor(sb, ownerIds);
    } catch (err) {
      captureError(err, { area: "cron", action: "world_monitor", route: "/api/cron/evening-recap" });
    }
  }

  // Once per day, archive audit_log rows older than 90 days into the
  // audit_log_archive table. Keeps the live table fast (it's queried
  // every Settings → audit-log open and on every middleware request that
  // logs an event). Idempotent.
  let archivedRows = 0;
  try {
    archivedRows = await archiveOldAuditRows(sb);
  } catch (err) {
    captureError(err, { area: "cron", action: "audit_retention", route: "/api/cron/evening-recap" });
  }

  // Daily YouTube → Notion view sync rides along here because free Vercel
  // only allows 2 cron jobs. Best-effort: never let it break the recap.
  let viewsSync: { checked: number; updated: number; errors: string[] } | { error: string } = { checked: 0, updated: 0, errors: [] };
  try {
    viewsSync = await syncYoutubeViews();
  } catch (err: any) {
    viewsSync = { error: err?.message ?? "view sync failed" };
    captureError(err, { area: "cron", action: "sync_views", route: "/api/cron/evening-recap" });
  }

  if (errors.length === 0 && sent.length > 0) {
    await telemetry.success({ sent: sent.length, archivedRows, viewsSync });
  } else if (sent.length > 0) {
    await telemetry.partial({ sent: sent.length, errors, archivedRows, viewsSync });
  } else {
    await telemetry.failure(new Error("All owner iterations failed"), { errors });
  }

  return NextResponse.json({ ok: true, sent, errors, archivedRows, viewsSync });
}
