// Tax Year page resolver. Caches { year → notion page id } so each Ledger
// write doesn't re-query Notion. Used by /api/bank/transactions confirm
// to populate the "Occurring Tax Year" relation, which drives:
//   • Gross Income YTD (CAD)
//   • Deductible Expenses (CAD)
//   • Net Income YTD (CAD)
//   • Tax Reserve Needed (CAD)
//   • Threshold Progress
// on the Tax Years page.
import { notion, DB } from "@/lib/notion";

const cache = new Map<number, string | null>(); // year → page id (or null if not found)
let cacheLoadedAt = 0;
const TTL_MS = 60 * 60 * 1000;  // refresh hourly

async function loadAll(): Promise<void> {
  if (Date.now() - cacheLoadedAt < TTL_MS && cache.size > 0) return;
  cache.clear();
  try {
    const res = await notion.dataSources.query({
      data_source_id: DB.TAX_YEARS,
      page_size: 50,
    });
    for (const page of (res.results as any[])) {
      const name: string = page.properties?.["Name"]?.title?.[0]?.plain_text ?? "";
      const match = name.match(/(20\d{2})/);
      if (match) {
        const year = Number(match[1]);
        cache.set(year, page.id);
      }
    }
    cacheLoadedAt = Date.now();
  } catch (err: any) {
    console.error("Tax years preload failed:", err?.message);
  }
}

/** Returns the Notion page id for the tax year matching the given calendar
 *  year (derived from a transaction date), or null if not found. */
export async function findTaxYearPageId(year: number): Promise<string | null> {
  await loadAll();
  return cache.get(year) ?? null;
}

export function invalidateTaxYearCache() {
  cache.clear();
  cacheLoadedAt = 0;
}
