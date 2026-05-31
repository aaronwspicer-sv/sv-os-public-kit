// Audit-log retention. Moves rows older than RETENTION_DAYS from
// audit_log → audit_log_archive in batches. Keeps the live audit_log
// fast for the Settings audit viewer; archive is queried rarely (forensic
// investigations only).
//
// Called from the evening-recap cron once per day. Idempotent — safe to
// call multiple times. Returns the number of rows moved.
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/sentry";

const RETENTION_DAYS = 90;
const BATCH_SIZE = 500;

export async function archiveOldAuditRows(sb: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString();
  let totalMoved = 0;
  // Loop in batches so a one-time sweep of months-old data doesn't blow
  // out the function timeout.
  for (let iter = 0; iter < 20; iter++) {
    const { data: rows, error: selErr } = await sb
      .from("audit_log")
      .select("id, user_id, action, ip, user_agent, metadata, created_at")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);
    if (selErr) { captureError(selErr, { area: "audit_retention", action: "select" }); break; }
    if (!rows || rows.length === 0) break;

    const archiveRows = rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      action: r.action,
      ip: r.ip,
      user_agent: r.user_agent,
      metadata: r.metadata,
      created_at: r.created_at,
    }));

    const { error: insErr } = await sb.from("audit_log_archive").upsert(archiveRows, { onConflict: "id" });
    if (insErr) { captureError(insErr, { area: "audit_retention", action: "archive_insert" }); break; }

    const idsToDelete = rows.map(r => r.id);
    const { error: delErr } = await sb.from("audit_log").delete().in("id", idsToDelete);
    if (delErr) { captureError(delErr, { area: "audit_retention", action: "live_delete" }); break; }

    totalMoved += rows.length;
    if (rows.length < BATCH_SIZE) break; // last batch
  }
  return totalMoved;
}
