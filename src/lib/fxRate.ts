// USD → CAD live rate. Used when confirming a USD transaction so the Notion
// Ledger's Amount CAD formula renders correctly.
//
// Source: Frankfurter (frankfurter.dev) — Bank of Canada-backed, free,
// no API key. 24h in-memory cache (FX moves a fraction of a percent per day
// at his scale, daily resolution is plenty).

let cache: { rate: number; at: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

export async function getUsdToCad(): Promise<number | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rate;
  try {
    const r = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const rate = d?.rates?.CAD;
    if (typeof rate !== "number" || rate <= 0) return null;
    cache = { rate, at: Date.now() };
    return rate;
  } catch {
    return null;
  }
}
