// GET /api/health/setup
// Verifies the OS is correctly wired before it tries to use anything:
//   - all required env vars are set
//   - every Notion DB is reachable
//   - critical Notion properties exist on each DB
//   - Supabase is reachable + cron_runs / audit_log exist
//   - Resend key present
//   - Sentry DSN present
//
// Run this AFTER a deploy. The same check is also surfaced on the
// Settings → Health page. Failures are NOT fatal — they're reported as
// warnings so you can see what's wrong without the OS refusing to boot.
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB, resolveDataSourceId } from "@/lib/notion";
import { NOTION_PROPS } from "@/lib/notionProps";
import { createClient } from "@supabase/supabase-js";
import { captureError, captureWarn } from "@/lib/sentry";

export const runtime = "nodejs";

type Check = { name: string; ok: boolean; detail?: string };

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENCRYPTION_KEY",
  "NOTION_API_KEY",
  "NOTION_LOG_DB_ID",
  "NOTION_LEDGER_DB_ID",
  "NOTION_ACCOUNTS_DB_ID",
  "NOTION_GOALS_DB_ID",
  "NOTION_SV_VIDEOS_DB_ID",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "OPENAI_API_KEY",
  "FINANCE_VAULT_SECRET",
];

// Expected properties per Notion DB. Sourced from src/lib/notionProps.ts
// so the single source of truth is the constants file — if Aaron renames
// a property in Notion he updates one place and this check catches drift.
const NOTION_REQUIRED_PROPS: Record<string, { db: keyof typeof DB; props: string[] }> = {
  log:      { db: "LOG",      props: Object.values(NOTION_PROPS.LOG) },
  ledger:   { db: "LEDGER",   props: Object.values(NOTION_PROPS.LEDGER) },
  accounts: { db: "ACCOUNTS", props: Object.values(NOTION_PROPS.ACCOUNTS) },
  videos:   { db: "VIDEOS",   props: Object.values(NOTION_PROPS.VIDEOS) },
  // Goals is hand-curated — props are loose
  goals:    { db: "GOALS",    props: [] },
};

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;

  const checks: Check[] = [];
  const warnings: Check[] = [];

  // 1. Env vars
  for (const key of REQUIRED_ENV) {
    const ok = !!process.env[key];
    (ok ? checks : warnings).push({
      name: `env:${key}`,
      ok,
      detail: ok ? undefined : "missing",
    });
  }
  // Sentry is optional — only warn if not set
  if (!process.env.SENTRY_DSN) {
    warnings.push({ name: "env:SENTRY_DSN", ok: false, detail: "Sentry disabled — errors won't be captured" });
  }

  // 2. Supabase reachable + key tables exist
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    for (const table of ["audit_log", "cron_runs", "daily_todos", "bank_accounts", "bank_transactions", "alfred_memories", "alfred_settings"]) {
      const { error } = await sb.from(table).select("*", { count: "exact", head: true }).limit(1);
      checks.push({
        name: `supabase:${table}`,
        ok: !error,
        detail: error?.message,
      });
    }
  } catch (err: any) {
    checks.push({ name: "supabase:connection", ok: false, detail: err?.message });
  }

  // 3. Notion DBs reachable + required properties present
  for (const [label, cfg] of Object.entries(NOTION_REQUIRED_PROPS)) {
    const dbId = DB[cfg.db];
    if (!dbId) {
      checks.push({ name: `notion:${label}:env`, ok: false, detail: `NOTION_${cfg.db}_DB_ID unset` });
      continue;
    }
    try {
      // resolveDataSourceId handles env vars that store either a DB ID or
      // a data source ID. Either is fine — we only need it to read the schema.
      const dsId = await resolveDataSourceId(dbId);
      const ds: any = await notion.dataSources.retrieve({ data_source_id: dsId } as never);
      const presentProps = new Set(Object.keys(ds?.properties ?? {}));
      const missing = cfg.props.filter(p => !presentProps.has(p));
      if (missing.length === 0) {
        checks.push({ name: `notion:${label}`, ok: true });
      } else {
        checks.push({
          name: `notion:${label}:props`,
          ok: false,
          detail: `Missing properties: ${missing.join(", ")}`,
        });
        captureWarn(`Notion ${label} DB missing properties`, { area: "setup", extra: { missing } });
      }
    } catch (err: any) {
      checks.push({ name: `notion:${label}`, ok: false, detail: err?.message?.slice(0, 200) });
      captureError(err, { area: "setup", action: "notion_check", extra: { db: label } });
    }
  }

  const allOk = checks.every(c => c.ok);
  return NextResponse.json({
    ok: allOk,
    checkedAt: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed: checks.filter(c => c.ok).length,
      failed: checks.filter(c => !c.ok).length,
      warnings: warnings.length,
    },
    checks,
    warnings,
  });
}
