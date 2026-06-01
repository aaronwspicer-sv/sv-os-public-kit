// Vercel cron — fires at 11:00 UTC = 7am EDT / 6am EST Toronto.
// Sends the morning brief email + (if today has open todos) a parallel push.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { fetchWeather, fetchHeadlines, fetchMarkets, fetchJays } from "@/lib/brief/sources";
import { gatherUserData } from "@/lib/brief/userData";
import { pickHero } from "@/lib/brief/hero";
import { renderMorningBrief } from "@/lib/brief/render";
import { sendPushToUser } from "@/lib/push";
import { requireOwner } from "@/lib/auth";
import { detectPatterns, generateMorningInsight, detectDeadTime } from "@/lib/alfred/autonomous";
import { createClient } from "@supabase/supabase-js";
import { torontoDayOfWeek } from "@/lib/torontoDay";
import { startCronRun, getStaleCronJobs } from "@/lib/cronTelemetry";
import { captureError } from "@/lib/sentry";
import { drainIntrusionDigest } from "@/lib/intrusion";
import { config } from "@/config";

// Vercel Hobby default timeout = 10s. The brief easily runs 15-20s because
// it fans out to weather + news + markets + jays + Notion + GPT in parallel.
// Bumping to 60s so the cron stops silently timing out → being paused by Vercel.
export const runtime = "nodejs";
export const maxDuration = 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const OWNER_USER_IDS_ENV = process.env.OWNER_USER_IDS?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
const ALERT_EMAIL        = config.owner.alertEmail;
const OWNER_NAME         = config.owner.name;

// Fallback: if OWNER_USER_IDS env var is unset, look up the single owner user from Supabase auth.
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
  // Vercel cron's documented auth: `Authorization: Bearer <CRON_SECRET>`.
  // The old code only checked a non-standard `x-vercel-cron === "1"` header
  // (Vercel doesn't reliably set this) and a custom `x-cron-secret` header
  // (Vercel never sets this), which is why every scheduled run was 401'ing.
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const xCronSecret = req.headers.get("x-cron-secret"); // legacy / manual-curl path
  const ua = req.headers.get("user-agent") ?? "";
  // Three accepted forms:
  //   1. Vercel cron — Authorization: Bearer <CRON_SECRET>
  //   2. Legacy manual trigger — x-cron-secret: <CRON_SECRET>
  //   3. Vercel cron without secret set — User-Agent: vercel-cron/1.0
  //      (only trusted if CRON_SECRET isn't configured, so misconfig fails
  //      closed instead of letting unauthenticated callers slip through)
  if (cronSecret && (bearer === cronSecret || xCronSecret === cronSecret)) {
    return { ok: true, isPreview: false };
  }
  if (!cronSecret && ua.toLowerCase().startsWith("vercel-cron")) {
    return { ok: true, isPreview: false };
  }
  // Owner can preview manually from Settings (Supabase session)
  const gate = await requireOwner();
  if (!gate.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { ok: true, isPreview: true };
}

export async function GET(req: NextRequest)  { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  const auth = await authorize(req);
  if (auth instanceof NextResponse) return auth;
  const telemetry = startCronRun("morning-brief");
  if (!process.env.RESEND_API_KEY) {
    await telemetry.failure(new Error("Resend not configured"));
    return NextResponse.json({ error: "Resend not configured" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const sent: string[] = [];
  const errors: string[] = [];
  const sb = admin();
  const todayDow = torontoDayOfWeek();

  // Resolve owner IDs — falls back to Supabase auth if env var is unset
  const ownerIds = await resolveOwnerIds(sb);

  // Drain any unnotified intrusion attempts from the last 24h into a single
  // digest email. Replaces the unreliable fire-and-forget Resend call that
  // used to run inside middleware (Edge Runtime terminated before it fired).
  try {
    const notified = await drainIntrusionDigest(sb, process.env.RESEND_API_KEY);
    if (notified > 0) console.log(`[morning-brief] intrusion digest: ${notified} attempts notified`);
  } catch (err) {
    captureError(err, { area: "cron", action: "intrusion_digest", route: "/api/cron/morning-brief" });
  }

  // Stale-cron self-check — if any scheduled job hasn't run successfully in
  // 36h, surface it as a push so the owner notices BEFORE silently losing
  // another month of briefs.
  try {
    const stale = await getStaleCronJobs(36);
    if (stale.length > 0 && ownerIds[0]) {
      const { sendPushToUser } = await import("@/lib/push");
      await sendPushToUser(ownerIds[0], {
        title: "⚠️ Scheduled job stalled",
        body:  stale.map(s => `${s.name} (${s.status ?? "never run"})`).join(", "),
        url:   "/d/settings",
        tag:   "cron-stale",
        requireInteraction: true,
      }, sb).catch(() => {});
    }
  } catch (err) {
    captureError(err, { area: "cron", action: "stale_check", route: "/api/cron/morning-brief" });
  }

  // Fetch all external sources ONCE (shared across all owner users).
  // Jays is gated — skipped entirely when the feature is off.
  const [weather, headlines, markets, jays] = await Promise.all([
    fetchWeather(), fetchHeadlines(), fetchMarkets(),
    config.features.jays ? fetchJays() : Promise.resolve(null),
  ]);
  const sources = { weather, headlines, markets, jays };

  for (const uid of ownerIds) {
    try {
      const data = await gatherUserData(uid);
      const patterns = detectPatterns(data);
      const deadSlots = await detectDeadTime(sb, uid).catch(() => []);

      // "On this day" — memories saved ~1 year ago (±7 days)
      const onThisDay = await (async () => {
        try {
          const now = new Date();
          const oneYearAgo = new Date(now);
          oneYearAgo.setFullYear(now.getFullYear() - 1);
          const from = new Date(oneYearAgo); from.setDate(from.getDate() - 7);
          const to   = new Date(oneYearAgo); to.setDate(to.getDate() + 7);
          const { data: rows } = await sb
            .from("alfred_memories")
            .select("content, kind, created_at")
            .eq("user_id", uid)
            .gte("created_at", from.toISOString())
            .lte("created_at", to.toISOString())
            .order("importance", { ascending: false })
            .limit(3);
          return (rows ?? []) as { content: string; kind: string; created_at: string }[];
        } catch { return []; }
      })();
      // Let Alfred override the static hero with a fresh per-day take
      const alfredInsight = await generateMorningInsight(uid);
      const hero = alfredInsight
        ? { emoji: "✦", text: alfredInsight, tone: "celebrate" as const }
        : pickHero(data);
      // Append top 3 patterns into the hero line if there are urgent ones
      const urgentPatterns = patterns.filter(p => p.severity === "alert" || p.severity === "warn").slice(0, 3);
      const deadTimeLine = deadSlots.length > 0
        ? `\n\n🕐 Open blocks today: ${deadSlots.map(s => s.label).join("  ·  ")}`
        : "";
      const heroWithPatterns = urgentPatterns.length > 0 || deadSlots.length > 0
        ? { ...hero, text: `${hero.text}\n\n${urgentPatterns.map(p => `${p.emoji} ${p.text}`).join("  ·  ")}${deadTimeLine}`.trim() }
        : hero;
      const { subject, html } = renderMorningBrief({ name: OWNER_NAME, hero: heroWithPatterns, data, sources, alfredMemories: onThisDay });

      await resend.emails.send({
        from: config.brand.emailFrom,
        to:   ALERT_EMAIL,
        subject,
        html,
      });
      sent.push(uid);

      // ── Weekly reconcile reminder ──
      // If today (Toronto) matches the user's chosen reconcile_reminder_dow,
      // fire a push notification + send a separate compact reminder email.
      try {
        const { data: settings } = await sb
          .from("alfred_settings")
          .select("reconcile_reminder_dow")
          .eq("user_id", uid)
          .maybeSingle();
        const targetDow = settings?.reconcile_reminder_dow;
        if (targetDow !== null && targetDow !== undefined && Number(targetDow) === todayDow) {
          sendPushToUser(uid, {
            title: "🏦 Reconcile day",
            body:  "Export this week's CSVs from RBC + TD and drop them in /finances.",
            url:   "/d/finances",
            tag:   "reconcile-reminder",
            requireInteraction: true,
          }, sb).catch(() => {});
          // Lightweight email reminder (separate from the brief itself)
          await resend.emails.send({
            from: config.brand.emailFrom,
            to:   ALERT_EMAIL,
            subject: "🏦 Reconcile day — upload your bank CSVs",
            html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#000;color:#fafafa;padding:24px;">
              <div style="max-width:520px;margin:0 auto;background:#0a0a0a;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;">
                <h2 style="font-size:20px;margin:0 0 12px;color:#1d9bf0;">🏦 Reconcile day</h2>
                <p style="font-size:13px;color:#a1a1aa;line-height:1.55;margin:0 0 16px;">
                  Quick weekly reset — pull the latest transactions in so your finances stay accurate.
                </p>
                <ol style="font-size:13px;color:#fafafa;line-height:1.7;padding-left:18px;">
                  <li><b>RBC Online Banking</b> → account → Download Transactions → CSV</li>
                  <li><b>TD EasyWeb</b> → account → Download Transactions → CSV</li>
                  <li>Drop both into /d/finances → done in 3 min</li>
                </ol>
                <div style="margin-top:20px;text-align:center;">
                  <a href="${config.brand.appUrl}/d/finances" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(180deg,#3eb0ff,#1d9bf0);color:#000;font-weight:700;text-decoration:none;font-size:13px;">
                    Open finances →
                  </a>
                </div>
              </div>
            </div>`,
          }).catch(() => {});
        }
      } catch (err: any) {
        console.error("reconcile reminder failed:", err?.message);
      }

      // Parallel morning push if there are tasks today
      if (data.todosOpenCount > 0) {
        sendPushToUser(uid, {
          title: `🎯 ${data.todosOpenCount} task${data.todosOpenCount === 1 ? "" : "s"} ready for today`,
          body:  hero.text,
          url:   "/d",
          tag:   "morning-brief",
        }, sb).catch(() => {});
      }
    } catch (err: any) {
      errors.push(`${uid}: ${err?.message ?? "unknown"}`);
      captureError(err, { area: "cron", action: "morning_brief_for_user", route: "/api/cron/morning-brief", userId: uid });
    }
  }

  // Record the run AFTER all per-user iterations so the telemetry row
  // reflects the overall result. If even one user failed we record `partial`
  // — that's still useful (cron is alive, just a particular fetch broke).
  if (errors.length === 0 && sent.length > 0) {
    await telemetry.success({ sent: sent.length });
  } else if (sent.length > 0) {
    await telemetry.partial({ sent: sent.length, errors });
  } else {
    await telemetry.failure(new Error("All owner iterations failed"), { errors });
  }

  return NextResponse.json({ ok: true, sent, errors });
}
