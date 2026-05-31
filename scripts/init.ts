#!/usr/bin/env -S npx tsx
// ─────────────────────────────────────────────────────────────
// Spicer OS — interactive setup
//   npm run init
// ─────────────────────────────────────────────────────────────
// Walks you through making the OS YOURS: identity, brand, locale,
// features, and the API keys. Auto-generates every secret + the VAPID
// push keypair so you never touch `openssl`. Writes .env.local.
//
// Tiers:
//   quick — minimum to boot (Supabase + Notion + OpenAI + Resend)
//   full  — quick + Sentry, maps, YouTube
//   power — full + Upstash rate-limit, web search, model overrides
//
// Re-runnable: refuses to clobber an existing .env.local unless you say so.
// ─────────────────────────────────────────────────────────────
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rl = readline.createInterface({ input, output });

// Non-interactive mode: `npm run init -- --defaults`. Uses every default and
// skips prompts. Useful for CI / re-runs / scripted setup — and makes the
// write path testable without a TTY.
const DEFAULTS = process.argv.includes("--defaults");

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function ask(q: string, def?: string): Promise<string> {
  if (DEFAULTS) return def ?? "";
  const hint = def ? C.dim(` (${def})`) : "";
  const a = (await rl.question(`${C.cyan("?")} ${q}${hint}: `)).trim();
  return a || def || "";
}
async function askBool(q: string, def = true): Promise<boolean> {
  if (DEFAULTS) return def;
  const a = (await rl.question(`${C.cyan("?")} ${q} ${C.dim(def ? "[Y/n]" : "[y/N]")}: `)).trim();
  if (!a) return def;
  return /^y/i.test(a);
}
function section(title: string) {
  console.log(`\n${C.bold(C.yellow("── " + title + " ──"))}`);
}

const hex = (bytes: number) => randomBytes(bytes).toString("hex");
const b64 = (bytes: number) => randomBytes(bytes).toString("base64");

(async () => {
  console.log(C.bold("\n  Spicer OS — setup\n"));
  console.log(C.dim("  This writes .env.local. Secrets are auto-generated; you'll paste API keys.\n"));

  const envPath = join(process.cwd(), ".env.local");
  if (existsSync(envPath) && !DEFAULTS) {
    const ok = await askBool(C.yellow(".env.local already exists — overwrite it?"), false);
    if (!ok) { console.log(C.dim("Aborted — nothing written.")); rl.close(); return; }
  }

  const tier = (await ask("Setup tier — quick / full / power", "quick")).toLowerCase();
  const isFull = tier === "full" || tier === "power";
  const isPower = tier === "power";

  // ── Identity & brand ──
  section("You & your brand");
  const ownerName = await ask("Your first name");
  const ownerFull = await ask("Your full name", ownerName);
  const ownerEmail = await ask("Your email (alerts + briefs go here)");
  const brandName = await ask("Brand / product name", "My Life OS");
  const brandShort = await ask("Short brand name", brandName);
  const tagline = await ask("Tagline", "Personal Life System");
  const domain = await ask("Your domain (no https://)", "localhost:3000");
  const appUrl = await ask("Full app URL", domain.includes("localhost") ? "http://localhost:3000" : `https://${domain}`);
  const emailFrom = await ask("Transactional email 'from'", `${brandShort} <hello@${domain.replace(/^www\./, "")}>`);

  // ── Locale ──
  section("Locale");
  console.log(C.dim("  Timezone is any IANA name (America/New_York, Europe/London, Asia/Tokyo…)."));
  const timezone = await ask("Timezone", "America/Toronto");
  const locale = await ask("Locale (BCP-47)", "en-CA");
  const currency = await ask("Currency (ISO 4217)", "CAD");
  const weatherLabel = await ask("Home city label (weather widget)", "Toronto");
  const weatherLat = await ask("Home latitude", "43.6532");
  const weatherLon = await ask("Home longitude", "-79.3832");

  // ── Features ──
  section("Features (turn off the ones you don't want)");
  const featJays = await askBool("Toronto Blue Jays widget?", false);
  const featTax = await askBool("Canadian tax-year ledger relation?", false);
  const featWorkout = await askBool("Workout Notion DB?", true);
  const featVault = await askBool("Finance vault + bank CSV import? (sensitive)", true);

  // ── Supabase ──
  section("Supabase  " + C.dim("(supabase.com → Project → Settings → API)"));
  const sbUrl = await ask("Project URL (https://xxx.supabase.co)");
  const sbAnon = await ask("anon public key");
  const sbService = await ask("service_role key (secret!)");

  // ── Notion ──
  section("Notion  " + C.dim("(notion.so/my-integrations → key; share each DB with it)"));
  const notionKey = await ask("Integration API key (secret_…)");
  const notionLog = await ask("Log DB id");
  const notionGoals = await ask("Goals DB id");
  const notionVideos = await ask("SV Videos DB id");
  const notionAccounts = await ask("Accounts DB id");
  const notionLedger = await ask("Ledger DB id");
  const notionWorkout = featWorkout ? await ask("Workout DB id") : "";
  const notionTax = featTax ? await ask("Tax Years DB id") : "";

  // ── OpenAI + Resend ──
  section("OpenAI & Resend");
  const openaiKey = await ask("OpenAI API key (sk-…)");
  const resendKey = await ask("Resend API key (re_…)");

  // ── Optional tiers ──
  let sentryDsn = "", sentryOrg = "", sentryProject = "", sentryToken = "", mapbox = "", youtube = "";
  if (isFull) {
    section("Observability & extras (full)  " + C.dim("(leave blank to skip)"));
    sentryDsn = await ask("Sentry DSN");
    sentryOrg = await ask("Sentry org slug");
    sentryProject = await ask("Sentry project");
    sentryToken = await ask("Sentry auth token (source maps)");
    mapbox = await ask("Mapbox token (timeline maps)");
    youtube = await ask("YouTube Data API key (content research)");
  }
  let upstashUrl = "", upstashToken = "", tavily = "", ownerUserIds = "";
  if (isPower) {
    section("Power extras  " + C.dim("(leave blank to skip)"));
    upstashUrl = await ask("Upstash Redis REST URL (rate limiting)");
    upstashToken = await ask("Upstash Redis REST token");
    tavily = await ask("Tavily API key (Alfred web search)");
    ownerUserIds = await ask("Supabase user id(s), comma-sep (fill after first login)");
  }

  // ── Generate secrets ──
  section("Generating secrets");
  const encryptionKey = hex(32);
  const financeVaultSecret = hex(32);
  const twoFaSecret = b64(32);
  const cronSecret = b64(32);
  console.log(C.green("  ✓ ENCRYPTION_KEY, FINANCE_VAULT_SECRET, TWO_FA_COOKIE_SECRET, CRON_SECRET"));

  let vapidPublic = "", vapidPrivate = "";
  try {
    const webpush = await import("web-push");
    const keys = (webpush.default ?? webpush).generateVAPIDKeys();
    vapidPublic = keys.publicKey; vapidPrivate = keys.privateKey;
    console.log(C.green("  ✓ VAPID push keypair"));
  } catch {
    console.log(C.yellow("  ! couldn't generate VAPID keys (push disabled until set)"));
  }

  // ── Assemble .env.local ──
  const bool = (b: boolean) => (b ? "true" : "false");
  const lines = [
    "# Generated by `npm run init` — do not commit.",
    "",
    "# ── Owner & brand ──",
    `NEXT_PUBLIC_OWNER_NAME=${ownerName}`,
    `NEXT_PUBLIC_OWNER_FULL_NAME=${ownerFull}`,
    `OWNER_EMAIL=${ownerEmail}`,
    `NEXT_PUBLIC_BRAND_NAME=${brandName}`,
    `NEXT_PUBLIC_BRAND_SHORT_NAME=${brandShort}`,
    `NEXT_PUBLIC_BRAND_TAGLINE=${tagline}`,
    `NEXT_PUBLIC_APP_DOMAIN=${domain}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `EMAIL_FROM=${emailFrom}`,
    "",
    "# ── Locale ──",
    `NEXT_PUBLIC_TIMEZONE=${timezone}`,
    `NEXT_PUBLIC_LOCALE=${locale}`,
    `NEXT_PUBLIC_CURRENCY=${currency}`,
    `NEXT_PUBLIC_WEATHER_LABEL=${weatherLabel}`,
    `NEXT_PUBLIC_WEATHER_LAT=${weatherLat}`,
    `NEXT_PUBLIC_WEATHER_LON=${weatherLon}`,
    "",
    "# ── Features ──",
    `NEXT_PUBLIC_FEATURE_JAYS=${bool(featJays)}`,
    `NEXT_PUBLIC_FEATURE_TAX_YEAR=${bool(featTax)}`,
    `NEXT_PUBLIC_FEATURE_WORKOUT=${bool(featWorkout)}`,
    `NEXT_PUBLIC_FEATURE_FINANCE_VAULT=${bool(featVault)}`,
    "",
    "# ── Supabase ──",
    `NEXT_PUBLIC_SUPABASE_URL=${sbUrl}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${sbAnon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${sbService}`,
    "",
    "# ── Notion ──",
    `NOTION_API_KEY=${notionKey}`,
    `NOTION_LOG_DB_ID=${notionLog}`,
    `NOTION_GOALS_DB_ID=${notionGoals}`,
    `NOTION_SV_VIDEOS_DB_ID=${notionVideos}`,
    `NOTION_ACCOUNTS_DB_ID=${notionAccounts}`,
    `NOTION_LEDGER_DB_ID=${notionLedger}`,
    `NOTION_WORKOUT_DB_ID=${notionWorkout}`,
    `NOTION_TAX_YEARS_DB_ID=${notionTax}`,
    "",
    "# ── OpenAI & Resend ──",
    `OPENAI_API_KEY=${openaiKey}`,
    `RESEND_API_KEY=${resendKey}`,
    "",
    "# ── Auto-generated secrets (keep private) ──",
    `ENCRYPTION_KEY=${encryptionKey}`,
    `FINANCE_VAULT_SECRET=${financeVaultSecret}`,
    `TWO_FA_COOKIE_SECRET=${twoFaSecret}`,
    `CRON_SECRET=${cronSecret}`,
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapidPublic}`,
    `VAPID_PUBLIC_KEY=${vapidPublic}`,
    `VAPID_PRIVATE_KEY=${vapidPrivate}`,
    `VAPID_SUBJECT=mailto:${ownerEmail}`,
    "",
    "# ── Optional ──",
    `NEXT_PUBLIC_SENTRY_DSN=${sentryDsn}`,
    `SENTRY_DSN=${sentryDsn}`,
    `SENTRY_ORG=${sentryOrg}`,
    `SENTRY_PROJECT=${sentryProject}`,
    `SENTRY_AUTH_TOKEN=${sentryToken}`,
    `NEXT_PUBLIC_MAPBOX_TOKEN=${mapbox}`,
    `YOUTUBE_API_KEY=${youtube}`,
    `UPSTASH_REDIS_REST_URL=${upstashUrl}`,
    `UPSTASH_REDIS_REST_TOKEN=${upstashToken}`,
    `TAVILY_API_KEY=${tavily}`,
    `OWNER_USER_IDS=${ownerUserIds}`,
    "",
  ];

  writeFileSync(envPath, lines.join("\n"));
  console.log(`\n${C.green("✓ Wrote .env.local")}`);

  // ── Allowlist reminder ──
  console.log(`\n${C.bold("Almost there — 2 manual steps:")}`);
  console.log(`  ${C.yellow("1.")} Add your email to the allowlist in ${C.cyan("src/lib/ownerAllowlist.ts")}`);
  console.log(`     (replace the default emails with: ${ownerEmail || "your@email.com"})`);
  console.log(`  ${C.yellow("2.")} Run the SQL in ${C.cyan("supabase/schema.sql")} + ${C.cyan("supabase/migrations/")} in your Supabase SQL editor`);
  console.log(`\n  Then: ${C.cyan("npm run dev")} → open ${appUrl}\n`);

  rl.close();
})();
