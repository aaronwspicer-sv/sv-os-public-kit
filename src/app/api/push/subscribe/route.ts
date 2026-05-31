import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

// POST — persist a browser PushSubscription for the current user.
// Body: { endpoint, keys: { p256dh, auth } }
export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Missing endpoint or keys" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth:   keys.auth,
    }, { onConflict: "user_id,endpoint" });

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a subscription (unsubscribe)
export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { endpoint } = await req.json();
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  return NextResponse.json({ ok: true });
}

// GET — count this user's active subscriptions (for the Settings toggle)
export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { count } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({ count: count ?? 0 });
}
