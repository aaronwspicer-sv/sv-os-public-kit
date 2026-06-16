// HTML renderer for the briefing emails. Dark-themed, mobile-first, no
// external CSS or images — inline styles only (email-client safe).
import type { UserBriefData } from "./userData";
import type { Hero } from "./hero";
import type { Weather, NewsItem, Ticker, JaysBrief } from "./sources";
import { config } from "@/config";

interface Sources {
  weather:   Weather | null;
  headlines: NewsItem[];
  markets:   Ticker[];
  jays:      JaysBrief | null;   // null when the Jays feature is disabled
}

const BG          = "#000000";
const CARD        = "rgba(255,255,255,0.04)";
const BORDER      = "rgba(255,255,255,0.08)";
const ACCENT      = "#1d9bf0";
const SUCCESS     = "#34d399";
const WARN        = "#fbbf24";
const DANGER      = "#ef4444";
const VIOLET      = "#a78bfa";
const TEXT_1      = "#fafafa";
const TEXT_2      = "#a1a1aa";
const TEXT_3      = "#6b7280";
const APP_URL     = config.brand.appUrl;
const FONT        = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtMoney(n: number | null | undefined, opts: { sign?: boolean; cents?: boolean } = {}): string {
  if (n == null) return "—";
  const sign = opts.sign && n > 0 ? "+" : "";
  if (Math.abs(n) >= 1000) return `${sign}$${Math.round(n).toLocaleString()}`;
  return `${sign}$${opts.cents ? n.toFixed(2) : Math.round(n).toString()}`;
}

function tile(label: string, value: string, color = TEXT_1): string {
  return `
    <td style="padding:14px 16px;background:${CARD};border:1px solid ${BORDER};border-radius:14px;width:50%;vertical-align:top;">
      <div style="font-size:10px;letter-spacing:2px;color:${TEXT_3};text-transform:uppercase;margin-bottom:6px;">${esc(label)}</div>
      <div style="font-size:22px;font-weight:700;color:${color};line-height:1.1;">${esc(value)}</div>
    </td>`;
}

function sectionTitle(title: string): string {
  return `<div style="font-size:10px;letter-spacing:2px;color:${TEXT_3};text-transform:uppercase;font-weight:700;margin:24px 0 10px;">${esc(title)}</div>`;
}

function habitChip(label: string, checked: boolean): string {
  const bg = checked ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)";
  const border = checked ? "rgba(52,211,153,0.32)" : BORDER;
  const color = checked ? SUCCESS : TEXT_3;
  const mark = checked ? "✓" : "○";
  return `<span style="display:inline-block;padding:6px 10px;border-radius:999px;background:${bg};border:1px solid ${border};color:${color};font-size:11px;font-weight:600;margin-right:6px;margin-bottom:6px;">${mark} ${esc(label)}</span>`;
}

function heroBlock(h: Hero): string {
  const accent = h.tone === "celebrate" ? SUCCESS : h.tone === "warn" ? WARN : h.tone === "memory" ? VIOLET : ACCENT;
  return `
    <div style="margin:16px 0 20px;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg, rgba(29,155,240,0.10), rgba(167,139,250,0.06));border:1px solid ${accent}44;">
      <div style="font-size:30px;line-height:1;margin-bottom:8px;">${h.emoji}</div>
      <div style="font-size:18px;font-weight:600;color:${TEXT_1};line-height:1.35;">${esc(h.text)}</div>
    </div>`;
}

function shell(title: string, preheader: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT_1};font-family:${FONT};">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:0;">${esc(preheader)}</span>
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${BG};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:540px;background:#0a0a0a;border:1px solid ${BORDER};border-radius:20px;">
        <tr><td style="padding:24px;">${body}</td></tr>
      </table>
      <div style="margin-top:14px;font-size:10px;color:${TEXT_3};letter-spacing:1px;text-transform:uppercase;">${esc(config.brand.name)} · ${esc(config.locale.weather.label)}</div>
    </td></tr>
  </table>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
//   MORNING BRIEF
// ─────────────────────────────────────────────────────────────
export function renderMorningBrief(opts: {
  name: string;
  hero: Hero;
  data: UserBriefData;
  sources: Sources;
  alfredMemories?: { content: string; kind: string; created_at: string }[];
  alfredNarrative?: string;
}): { subject: string; html: string } {
  const { name, hero, data, sources, alfredMemories, alfredNarrative } = opts;
  const { weather, headlines, markets, jays } = sources;

  const dateLabel = new Date().toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });

  const weatherStr = weather
    ? `${weather.emoji} ${weather.tempC}°C · high ${weather.highC}° · low ${weather.lowC}°`
    : "";
  const sunStr = weather ? `Sunrise ${weather.sunrise} · Sunset ${weather.sunset}` : "";

  const habits = data.todayLog
    ? `${habitChip("Workout", data.todayLog.workout)}${habitChip("NF", data.todayLog.nf)}${habitChip("Video", data.todayLog.video)}${habitChip("Journal", data.todayLog.journal)}`
    : `${habitChip("Workout", false)}${habitChip("NF", false)}${habitChip("Video", false)}${habitChip("Journal", false)}`;

  const todos = data.todosOpen.length === 0
    ? `<div style="color:${TEXT_3};font-size:12px;font-style:italic;">No tasks set for today yet.</div>`
    : data.todosOpen.map(t => `<div style="font-size:13px;color:${TEXT_1};padding:6px 0;border-bottom:1px solid ${BORDER};">□ ${esc(t.text)}</div>`).join("");

  // SECURITY: the morning brief runs from a cron, no user session, so the
  // Finance Vault can't be checked. Email is also a higher-risk channel
  // (forwarded, screenshotted, leaked from inbox compromise). So we DO NOT
  // include net worth, week spend, or week income in the email. The user
  // can ask Alfred for these inside the OS where the vault gate applies.
  const numbers = `
    <table role="presentation" cellspacing="8" cellpadding="0" border="0" width="100%">
      <tr>${tile("Week hours", `${data.weekHours}h`)}${tile("Videos this month", String(data.monthVideos))}</tr>
    </table>`;

  const yesterday = data.yesterdayLog
    ? `<div style="font-size:13px;color:${TEXT_2};">${[
        `${[data.yesterdayLog.workout, data.yesterdayLog.nf, data.yesterdayLog.video, data.yesterdayLog.journal].filter(Boolean).length}/4 habits`,
        `${data.yesterdayLog.hours.toFixed(1)}h worked`,
        data.yesterdayLog.views ? `${data.yesterdayLog.views.toLocaleString()} views` : null,
      ].filter(Boolean).join(" · ")}</div>`
    : `<div style="font-size:13px;color:${TEXT_3};font-style:italic;">No log entry yesterday.</div>`;

  const moneyPulse = data.unreviewedTxCount > 0
    ? `<div style="margin:6px 0;padding:12px 14px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.22);border-radius:12px;color:${WARN};font-size:13px;font-weight:600;">🔔 ${data.unreviewedTxCount} unreviewed transaction${data.unreviewedTxCount === 1 ? "" : "s"}</div>`
    : "";

  const marketRows = markets.length === 0 ? "" : `
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
      ${markets.map(m => {
        const up = m.changePct >= 0;
        const color = up ? SUCCESS : DANGER;
        const arrow = up ? "▲" : "▼";
        const priceStr = m.price >= 100 ? Math.round(m.price).toLocaleString() : m.price.toFixed(2);
        return `<span style="display:inline-block;padding:4px 9px;border-radius:8px;background:${CARD};border:1px solid ${BORDER};font-size:11px;color:${TEXT_2};margin-right:4px;margin-bottom:4px;"><b style="color:${TEXT_1};">${esc(m.symbol)}</b> $${priceStr} <span style="color:${color};">${arrow}${Math.abs(m.changePct).toFixed(1)}%</span></span>`;
      }).join("")}
    </div>`;

  const headlinesHtml = headlines.length === 0 ? "" :
    headlines.map(h => `<a href="${esc(h.url)}" style="display:block;padding:8px 0;font-size:13px;color:${TEXT_1};text-decoration:none;border-bottom:1px solid ${BORDER};">📰 ${esc(h.title)}</a>`).join("");

  const jaysHtml = (jays && (jays.lastResult || jays.tonight))
    ? `<div style="font-size:13px;color:${TEXT_2};padding:4px 0;">⚾ ${jays.lastResult ? esc(jays.lastResult) : "no game"}${jays.tonight ? ` · ${esc(jays.tonight)}` : ""}</div>`
    : "";

  const onThisDay = data.oneYearAgoLog
    ? `<div style="margin:8px 0;padding:12px 14px;background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.22);border-radius:12px;color:${VIOLET};font-size:12px;">📅 <b>One year ago today</b> · ${[data.oneYearAgoLog.workout, data.oneYearAgoLog.nf, data.oneYearAgoLog.video, data.oneYearAgoLog.journal].filter(Boolean).length}/4 habits · ${data.oneYearAgoLog.hours.toFixed(1)}h${data.oneYearAgoLog.summary ? ` · "${esc(data.oneYearAgoLog.summary.slice(0, 80))}"` : ""}</div>`
    : "";

  const alfredOnThisDay = (alfredMemories && alfredMemories.length > 0)
    ? `<div style="margin:8px 0;padding:12px 14px;background:rgba(167,139,250,0.04);border:1px solid rgba(167,139,250,0.15);border-radius:12px;">
        <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${VIOLET};margin-bottom:8px;">🧠 Alfred remembers — a year ago</div>
        ${alfredMemories.slice(0, 3).map(m => `<div style="font-size:12px;color:${TEXT_2};padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04);">${m.kind !== "conversation_summary" ? `<span style="color:${VIOLET};font-size:10px;text-transform:uppercase;letter-spacing:1px;">[${esc(m.kind)}]</span> ` : ""}${esc(m.content)}</div>`).join("")}
       </div>`
    : "";

  const pipelineStr = ["Idea", "Scripting", "Filming", "Editing"].map(s => `${s} ${data.videosPipeline[s] ?? 0}`).join(" · ");

  const body = `
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${TEXT_3};">Morning brief</div>
    <div style="font-size:26px;font-weight:700;color:${TEXT_1};margin-top:6px;line-height:1.15;">Good morning, ${esc(name)}.</div>
    <div style="font-size:13px;color:${TEXT_2};margin-top:6px;">${esc(dateLabel)}${weatherStr ? ` · ${weatherStr}` : ""}</div>
    ${sunStr ? `<div style="font-size:11px;color:${TEXT_3};margin-top:2px;">${esc(sunStr)}</div>` : ""}

    ${heroBlock(hero)}

    ${alfredNarrative ? `
    <div style="margin:16px 0 20px;padding:18px 20px;border-radius:16px;background:linear-gradient(180deg,rgba(29,155,240,0.05),rgba(167,139,250,0.03));border:1px solid rgba(29,155,240,0.18);">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${ACCENT};font-weight:700;margin-bottom:12px;">✦ Alfred's Read</div>
      ${alfredNarrative.split(/\n\n+/).filter(Boolean).map(p => `<p style="font-size:14px;color:${TEXT_1};line-height:1.65;margin:0 0 10px;">${esc(p)}</p>`).join("")}
    </div>` : ""}

    ${sectionTitle("Today")}
    <div style="font-size:13px;color:${TEXT_2};margin-bottom:8px;">📋 ${data.todosOpenCount} task${data.todosOpenCount === 1 ? "" : "s"} open</div>
    ${todos}
    <div style="margin-top:14px;">${habits}</div>

    ${sectionTitle("The Numbers")}
    ${numbers}

    ${sectionTitle("Yesterday")}
    ${yesterday}

    ${moneyPulse}
    ${onThisDay}
    ${alfredOnThisDay}

    ${sectionTitle("In the world")}
    ${jaysHtml}
    ${marketRows}
    ${headlinesHtml ? `<div style="margin-top:10px;">${headlinesHtml}</div>` : ""}

    ${sectionTitle("Content pipeline")}
    <div style="font-size:13px;color:${TEXT_2};">📺 ${esc(pipelineStr)}</div>

    <div style="margin-top:28px;text-align:center;">
      <a href="${APP_URL}/d" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(180deg,#3eb0ff,#1d9bf0);color:#000;font-weight:700;text-decoration:none;font-size:13px;">Open ${config.brand.shortName} →</a>
    </div>`;

  const preheader = `${hero.emoji} ${hero.text}`;
  return {
    subject: `${hero.emoji} ${dateLabel.split(",")[0]} · ${hero.text.slice(0, 60)}`,
    html: shell("Morning Brief", preheader, body),
  };
}

// ─────────────────────────────────────────────────────────────
//   EVENING RECAP
// ─────────────────────────────────────────────────────────────
export function renderEveningRecap(opts: {
  name: string;
  data: UserBriefData;
}): { subject: string; html: string } {
  const { name, data } = opts;
  const dateLabel = new Date().toLocaleDateString("en-CA", {
    weekday: "long", month: "long", day: "numeric", timeZone: config.locale.timezone,
  });

  const log = data.todayLog;
  const habitCount = log ? [log.workout, log.nf, log.video, log.journal].filter(Boolean).length : 0;
  const grade = !log ? null
    : habitCount === 4 && log.hours >= 6 ? { letter: "A+", color: SUCCESS, msg: "Money day. Lock it in." }
    : habitCount >= 3 ? { letter: "A",  color: SUCCESS, msg: "Strong. Keep stacking." }
    : habitCount === 2 ? { letter: "B", color: WARN,   msg: "Decent. Push for 4/4 tomorrow." }
    : habitCount === 1 ? { letter: "C", color: WARN,   msg: "One in the bank. Better than zero." }
    : { letter: "F", color: DANGER, msg: "Rough day. Tomorrow's a clean slate." };

  const habits = log
    ? `${habitChip("Workout", log.workout)}${habitChip("NF", log.nf)}${habitChip("Video", log.video)}${habitChip("Journal", log.journal)}`
    : "";

  const streakStatus = `
    <table role="presentation" cellspacing="8" cellpadding="0" border="0" width="100%">
      <tr>
        ${tile("Workout streak", `${data.streaks.workout}d`, data.streaks.workout > 0 ? SUCCESS : TEXT_3)}
        ${tile("NF streak",      `${data.streaks.nf}d`,      data.streaks.nf      > 0 ? SUCCESS : TEXT_3)}
      </tr>
      <tr>
        ${tile("Video streak",   `${data.streaks.video}d`,   data.streaks.video   > 0 ? SUCCESS : TEXT_3)}
        ${tile("Journal streak", `${data.streaks.journal}d`, data.streaks.journal > 0 ? SUCCESS : TEXT_3)}
      </tr>
    </table>`;

  const noLog = !log;

  const body = `
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${TEXT_3};">Evening recap</div>
    <div style="font-size:26px;font-weight:700;color:${TEXT_1};margin-top:6px;line-height:1.15;">${esc(dateLabel)}</div>

    ${noLog ? `
      <div style="margin:20px 0;padding:18px;border-radius:16px;background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.22);">
        <div style="font-size:30px;line-height:1;margin-bottom:8px;">✍️</div>
        <div style="font-size:16px;font-weight:600;color:${WARN};">No log entry yet today.</div>
        <div style="font-size:12px;color:${TEXT_2};margin-top:4px;">Take 90 seconds to log what happened — habits, hours, the headline. Future-you will thank present-you.</div>
        <div style="margin-top:14px;">
          <a href="${APP_URL}/d/entry" style="display:inline-block;padding:10px 18px;border-radius:10px;background:${WARN};color:#000;font-weight:700;text-decoration:none;font-size:12px;">Log today →</a>
        </div>
      </div>
    ` : `
      <div style="margin:20px 0;padding:20px;border-radius:16px;background:linear-gradient(135deg, rgba(29,155,240,0.10), rgba(52,211,153,0.06));border:1px solid ${grade!.color}55;text-align:center;">
        <div style="font-size:54px;font-weight:800;color:${grade!.color};line-height:1;">${grade!.letter}</div>
        <div style="font-size:14px;color:${TEXT_1};margin-top:8px;font-weight:600;">${esc(grade!.msg)}</div>
      </div>

      ${sectionTitle("Today's habits")}
      <div>${habits}</div>

      ${sectionTitle("Today's numbers")}
      <table role="presentation" cellspacing="8" cellpadding="0" border="0" width="100%">
        <tr>
          ${tile("Hours", `${log.hours.toFixed(1)}h`)}
          ${tile("Views",  log.views ? log.views.toLocaleString() : "0")}
        </tr>
      </table>

      ${log.summary ? `${sectionTitle("Summary")}<div style="font-size:13px;color:${TEXT_1};padding:12px;background:${CARD};border-radius:10px;border:1px solid ${BORDER};">${esc(log.summary)}</div>` : ""}
    `}

    ${sectionTitle("Active streaks")}
    ${streakStatus}

    ${data.todosOpenCount > 0 ? `
      ${sectionTitle("Still on the list for tomorrow")}
      <div style="font-size:13px;color:${TEXT_2};">${data.todosOpenCount} undone task${data.todosOpenCount === 1 ? "" : "s"} carry forward.</div>
    ` : ""}

    <div style="margin-top:28px;text-align:center;">
      <a href="${APP_URL}/d/entry" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(180deg,#3eb0ff,#1d9bf0);color:#000;font-weight:700;text-decoration:none;font-size:13px;">${noLog ? "Log today" : "Edit today's log"} →</a>
    </div>`;

  const preheader = noLog
    ? "No log yet today — 90 seconds to capture it"
    : `${grade!.letter} · ${habitCount}/4 habits · ${log!.hours.toFixed(1)}h`;
  const subject = noLog
    ? `✍️ Don't let today slip — log it`
    : `${grade!.letter} · ${dateLabel.split(",")[0]}: ${habitCount}/4 habits, ${log!.hours.toFixed(1)}h`;

  return { subject, html: shell("Evening Recap", preheader, body) };
}
