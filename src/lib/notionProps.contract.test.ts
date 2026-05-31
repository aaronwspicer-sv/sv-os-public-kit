// Schema-contract test — verifies the property names in notionProps.ts
// actually exist on the live Notion DBs. Catches property renames in
// Notion within seconds of running, instead of waiting for a write to
// silently fail in production.
//
// This test hits the real Notion API and requires NOTION_API_KEY +
// the relevant NOTION_*_DB_ID env vars. It's excluded from the default
// test run (see vitest.config.ts) so PR builds without these creds don't
// fail. Run explicitly with:
//   npm run test:contract
import { describe, expect, it } from "vitest";

const HAS_NOTION = !!process.env.NOTION_API_KEY;

(HAS_NOTION ? describe : describe.skip)("Notion schema contract — property names", () => {
  it.each([
    ["LOG"],
    ["LEDGER"],
    ["ACCOUNTS"],
    ["VIDEOS"],
    // GOALS is hand-curated; loose contract.
  ])("all expected properties exist on %s DB", async (which) => {
    const { notion, DB, resolveDataSourceId } = await import("./notion");
    const { NOTION_PROPS } = await import("./notionProps");

    const dbId = DB[which as keyof typeof DB];
    expect(dbId, `NOTION_${which}_DB_ID is unset`).toBeTruthy();

    // Query a real page rather than the data_source schema endpoint.
    // The schema endpoint silently hides relation properties whose TARGET
    // DB the integration can't see (e.g. "Occurring Tax Year" → Tax Years
    // DB that isn't shared), which would falsely flag valid properties as
    // missing. Real pages always include every property the row has.
    const dsId = await resolveDataSourceId(dbId);
    const res: any = await notion.dataSources.query({
      data_source_id: dsId,
      page_size: 1,
    } as never);
    const page = res.results?.[0];
    expect(page, `${which} DB has no pages — can't introspect schema`).toBeTruthy();
    const presentProps = new Set(Object.keys(page.properties ?? {}));

    const expected = NOTION_PROPS[which as keyof typeof NOTION_PROPS];
    const missing: string[] = [];
    for (const name of Object.values(expected)) {
      if (!presentProps.has(name)) missing.push(name);
    }

    expect(
      missing,
      `Missing properties on ${which}: ${JSON.stringify(missing)}. Either Aaron renamed in Notion (update src/lib/notionProps.ts) or the property doesn't exist yet.`,
    ).toEqual([]);
  });
});
