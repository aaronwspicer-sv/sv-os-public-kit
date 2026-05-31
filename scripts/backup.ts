#!/usr/bin/env -S npx tsx
// Manual backup script — dumps every Supabase table + every Notion DB
// into timestamped JSON files under ./backups/.
//
// Run before any risky operation:
//   - SQL migrations (T5.1 drops, etc.)
//   - Notion bulk-archive operations
//   - Encryption key rotation
//
// Usage:
//   npx tsx scripts/backup.ts
//
// Requires: NOTION_API_KEY, NOTION_*_DB_ID, SUPABASE_SERVICE_ROLE_KEY,
//           NEXT_PUBLIC_SUPABASE_URL — all from .env.local.
//
// NOT a substitute for proper backups (Supabase has its own daily snapshots
// on Pro tier). This is a "moment-in-time JSON snapshot you can diff."
// NOTE: not using @supabase/supabase-js here — its realtime client requires
// a WebSocket polyfill on Node < 22 and we only need REST. Direct fetch
// against the PostgREST endpoint is simpler.
import { Client as NotionClient } from "@notionhq/client";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = join(process.cwd(), "backups", STAMP);

const SUPABASE_TABLES = [
  "daily_todos",
  "audit_log",
  "audit_log_archive",
  "user_pins",
  "user_totp",
  "user_passkeys",
  "known_devices",
  "alfred_conversations",
  "alfred_messages",
  "alfred_notes",
  "alfred_memories",
  "alfred_settings",
  "pipeline_videos",
  "user_calendars",
  "bank_customer",
  "bank_items",
  "bank_accounts",
  "bank_transactions",
  "manual_assets",
  "wishlist",
  "idea_inbox",
  "timeline_photos",
  "public_profiles",
  "sv_gpt_skill",
  "plaid_notion_account_map",
  "cron_runs",
];

const NOTION_DBS = [
  ["log",      process.env.NOTION_LOG_DB_ID],
  ["ledger",   process.env.NOTION_LEDGER_DB_ID],
  ["accounts", process.env.NOTION_ACCOUNTS_DB_ID],
  ["videos",   process.env.NOTION_SV_VIDEOS_DB_ID],
  ["goals",    process.env.NOTION_GOALS_DB_ID],
  ["workout",  process.env.NOTION_WORKOUT_DB_ID],
] as const;

async function backupSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.warn("[supabase] env vars missing — skipping"); return; }

  for (const table of SUPABASE_TABLES) {
    try {
      // PostgREST select all rows. Cap at 10k for safety; tables that grow
      // bigger would need range-based pagination.
      const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=10000`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Range-Unit": "items",
        },
      });
      if (!r.ok) {
        console.error(`[supabase] ${table}: HTTP ${r.status}`);
        continue;
      }
      const data = await r.json();
      await writeFile(join(OUT_DIR, `supabase-${table}.json`), JSON.stringify(data, null, 2));
      console.log(`[supabase] ${table}: ${Array.isArray(data) ? data.length : 0} rows`);
    } catch (e: any) {
      console.error(`[supabase] ${table}: ${e?.message}`);
    }
  }
}

async function backupNotion() {
  const key = process.env.NOTION_API_KEY;
  if (!key) { console.warn("[notion] NOTION_API_KEY missing — skipping"); return; }
  const notion = new NotionClient({ auth: key });

  for (const [label, dbOrDsId] of NOTION_DBS) {
    if (!dbOrDsId) { console.warn(`[notion] ${label}: env id unset`); continue; }
    // Resolve to data source id — same logic as src/lib/notion.ts
    let dsId = dbOrDsId;
    try {
      const db: any = await notion.databases.retrieve({ database_id: dbOrDsId });
      dsId = db?.data_sources?.[0]?.id ?? dbOrDsId;
    } catch { /* probably already a data source id */ }

    try {
      const pages: any[] = [];
      let cursor: string | undefined;
      while (true) {
        const res: any = await notion.dataSources.query({
          data_source_id: dsId,
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        } as never);
        pages.push(...(res.results ?? []));
        if (!res.has_more) break;
        cursor = res.next_cursor;
      }
      await writeFile(join(OUT_DIR, `notion-${label}.json`), JSON.stringify(pages, null, 2));
      console.log(`[notion] ${label}: ${pages.length} pages`);
    } catch (e: any) {
      console.warn(`[notion] ${label}: SKIP — ${e?.code ?? e?.message ?? "unknown"} (share the DB with your integration if you want this backed up)`);
    }
  }
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Backup dir: ${OUT_DIR}\n`);
  await Promise.all([backupSupabase(), backupNotion()]);
  console.log(`\nDone. ${OUT_DIR}`);
})();
