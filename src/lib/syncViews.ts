// Pulls live YouTube view counts for every "Live" SV video and writes the
// changed ones back to the Notion SV Videos DB. Shared by the evening-recap
// cron (free Vercel only allows 2 cron jobs, so this piggybacks on it) and
// the manual "Sync views" button in the Command tab. No auth / telemetry
// here — callers own that.
import { queryDatabase, updatePage, DB } from "@/lib/notion";

// Extract a YouTube video ID from the common URL shapes Aaron stores in the
// "Final Video" field: watch?v=, youtu.be/, /shorts/, /embed/.
export function youtubeId(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const m = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
    if (m) return m[2];
    return null;
  } catch {
    return null;
  }
}

export interface SyncViewsResult {
  checked: number;
  updated: number;
  errors: string[];
}

export async function syncYoutubeViews(): Promise<SyncViewsResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY not configured");

  // 1. Pull every Live video that has a parseable YouTube link.
  const pages = await queryDatabase(DB.VIDEOS, {
    property: "Status",
    select: { equals: "Live" },
  });

  const targets = pages
    .map((p: any) => ({
      pageId: p.id,
      title: p.properties?.["Title"]?.title?.[0]?.plain_text ?? "Untitled",
      ytId: youtubeId(p.properties?.["Final Video"]?.url ?? null),
      currentViews: p.properties?.["Views"]?.number ?? 0,
    }))
    .filter((t): t is { pageId: string; title: string; ytId: string; currentViews: number } => !!t.ytId);

  if (targets.length === 0) return { checked: 0, updated: 0, errors: [] };

  // 2. Batch-fetch view counts (YouTube allows up to 50 IDs per call).
  const viewsById = new Map<string, number>();
  for (let i = 0; i < targets.length; i += 50) {
    const ids = targets.slice(i, i + 50).map(t => t.ytId);
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${key}`,
      { cache: "no-store" },
    );
    if (!r.ok) throw new Error(`YouTube videos API failed: ${r.status}`);
    const d = await r.json();
    for (const item of d.items ?? []) {
      viewsById.set(item.id, Number(item.statistics?.viewCount ?? 0));
    }
  }

  // 3. Write back only the ones whose count actually changed.
  let updated = 0;
  const errors: string[] = [];
  for (const t of targets) {
    const fresh = viewsById.get(t.ytId);
    if (fresh == null || fresh === t.currentViews) continue;
    try {
      await updatePage(t.pageId, { "Views": { number: fresh } });
      updated++;
    } catch (err: any) {
      errors.push(`${t.title}: ${err?.message ?? "update failed"}`);
    }
  }

  return { checked: targets.length, updated, errors };
}
