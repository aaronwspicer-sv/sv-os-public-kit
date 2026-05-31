import { Client } from "@notionhq/client";

// Server-side only — never import in client components
export const notion = new Client({ auth: process.env.NOTION_API_KEY });

export const DB = {
  LOG:       process.env.NOTION_LOG_DB_ID!,
  WORKOUT:   process.env.NOTION_WORKOUT_DB_ID!,
  GOALS:     process.env.NOTION_GOALS_DB_ID!,
  VIDEOS:    process.env.NOTION_SV_VIDEOS_DB_ID!,
  ACCOUNTS:  process.env.NOTION_ACCOUNTS_DB_ID!,
  LEDGER:    process.env.NOTION_LEDGER_DB_ID!,
  TAX_YEARS: process.env.NOTION_TAX_YEARS_DB_ID!,   // 2e670a46-f264-80a2-b704-000b05f354f5
} as const;

// In @notionhq/client v5 / API version 2025-09-03, every database has one
// or more "data sources". dataSources.query and pages.create (with the
// new-style parent) need the data SOURCE id — NOT the database id.
//
// Aaron's env vars are inconsistent today: some hold a database ID
// (NOTION_LOG_DB_ID, NOTION_SV_VIDEOS_DB_ID, etc.) and at least one holds
// a data source ID (NOTION_LEDGER_DB_ID points at the data source). Rather
// than force a migration of env vars, this resolver accepts either form:
//   - If `databases.retrieve(id)` succeeds → the id was a database, return
//     its first data source's id (and cache).
//   - If it 404s → the id was already a data source id; cache and return.
// Net result: callers never have to know which form is in env.
const _dsCache = new Map<string, string>();
export async function resolveDataSourceId(dbOrDsId: string): Promise<string> {
  if (_dsCache.has(dbOrDsId)) return _dsCache.get(dbOrDsId)!;
  try {
    const db: any = await notion.databases.retrieve({ database_id: dbOrDsId });
    const dsId = db?.data_sources?.[0]?.id ?? dbOrDsId;
    _dsCache.set(dbOrDsId, dsId);
    return dsId;
  } catch {
    // Either the id was already a data source id (legitimate), or Notion is
    // momentarily down. Cache the input as-is so we don't hammer the retrieve
    // endpoint on every call.
    _dsCache.set(dbOrDsId, dbOrDsId);
    return dbOrDsId;
  }
}

// In @notionhq/client v5, databases.query moved to dataSources.query (param: data_source_id)
export async function queryDatabase(databaseId: string, filter?: object, sorts?: object[], pageSize?: number) {
  const dsId = await resolveDataSourceId(databaseId);
  const response = await notion.dataSources.query({
    data_source_id: dsId,
    ...(filter && { filter: filter as never }),
    ...(sorts && { sorts: sorts as never }),
    ...(pageSize != null && { page_size: pageSize }),
  });
  return response.results;
}

export async function createPage(databaseId: string, properties: object) {
  const dsId = await resolveDataSourceId(databaseId);
  return notion.pages.create({
    parent: { data_source_id: dsId } as never,
    properties: properties as never,
  } as never);
}

export async function updatePage(pageId: string, properties: object) {
  return notion.pages.update({
    page_id: pageId,
    properties: properties as never,
  });
}

// ── Log DB helpers ──────────────────────────────────────
export async function getTodayLogEntry(dateString: string) {
  const results = await queryDatabase(DB.LOG, {
    property: "Date And Time Logged",
    created_time: {
      equals: dateString,
    },
  });
  return results[0] ?? null;
}

// ── SV Videos helpers ───────────────────────────────────
export async function getVideosByStatus() {
  const results = await queryDatabase(DB.VIDEOS, undefined, [
    { property: "Status", direction: "ascending" },
  ]);
  return results;
}
