import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { config } from "@/config";

// POST — send a test notification to the current user (all devices).
export async function POST() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const result = await sendPushToUser(user.id, {
      title: `🔔 ${config.brand.shortName} test`,
      body:  "Notifications are working — fire away.",
      url:   "/d/settings",
      tag:   "test",
    });
    // Surface failure details so the client can show VAPID mismatch or expired-sub errors.
    return NextResponse.json({
      ok: result.sent > 0,
      ...result,
      error: result.failed > 0 ? (result.lastError ?? "Send failed — check VAPID keys") : undefined,
    });
  } catch (e: any) {
    console.error("Push test error:", e);
    return NextResponse.json({ ok: false, sent: 0, failed: 0, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
