// List sessions + revoke endpoints.
//   GET                          → list all non-revoked + recent revoked
//   POST { id }                  → revoke a single session (other device)
//   POST { revokeOthers: true }  → revoke every session except the current
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { readDeviceId } from "@/lib/deviceId";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const currentDid = await readDeviceId();

  const { data } = await supabase
    .from("user_sessions")
    .select("id, device_id, device_label, ip, city, region, country, created_at, last_seen_at, revoked_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });

  const sessions = (data ?? []).map(s => ({
    ...s,
    isCurrent: s.device_id === currentDid,
  }));
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const currentDid = await readDeviceId();
  const now = new Date().toISOString();

  if (body.revokeOthers) {
    const q = supabase
      .from("user_sessions")
      .update({ revoked_at: now })
      .eq("user_id", user.id)
      .is("revoked_at", null);
    if (currentDid) q.neq("device_id", currentDid);
    const { error } = await q;
    if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
    await supabase.from("audit_log").insert({
      user_id: user.id, action: "sessions_revoke_others",
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Guard: don't let user accidentally revoke their own current device this way
  // (use the explicit logout for that)
  const { data: target } = await supabase
    .from("user_sessions").select("device_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (currentDid && target.device_id === currentDid) {
    return NextResponse.json({ error: "Use Sign Out to revoke this device" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_sessions")
    .update({ revoked_at: now })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "session_revoked", metadata: { id },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
