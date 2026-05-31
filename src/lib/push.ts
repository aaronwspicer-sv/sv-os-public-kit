// Web Push helpers — wraps the `web-push` npm package + Supabase service-role lookup.
// Use sendPushToUser(userId, payload) anywhere on the server to notify all
// of a user's registered devices.
import webpush from "web-push";
import { config } from "@/config";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const pub  = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub  = process.env.VAPID_SUBJECT ?? `mailto:${config.owner.alertEmail}`;
  if (!pub || !priv) throw new Error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY env var");
  webpush.setVapidDetails(sub, pub, priv);
  vapidConfigured = true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;          // where to navigate on click
  tag?: string;          // dedup tag — same tag replaces previous
  requireInteraction?: boolean;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Pass an admin/service-role Supabase client from cron routes — they have no
// user session, so the default session client hits RLS and returns 0 rows.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  supabaseOverride?: SupabaseClient,
): Promise<{ sent: number; failed: number; lastError?: string }> {
  configureVapid();
  const supabase: SupabaseClient = supabaseOverride ?? (await createClient() as unknown as SupabaseClient);
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0, failed = 0;
  let lastError: string | undefined;
  const stale: string[] = [];

  await Promise.all(subs.map(async (s: PushSubscriptionRow) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent++;
    } catch (e: any) {
      failed++;
      lastError = `HTTP ${e?.statusCode}: ${e?.body ?? e?.message}`;
      if (e?.statusCode === 404 || e?.statusCode === 410) stale.push(s.endpoint);
      else console.error("Push send error:", e?.statusCode, e?.body ?? e?.message);
    }
  }));

  if (stale.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", stale);
  }

  return { sent, failed, lastError };
}
