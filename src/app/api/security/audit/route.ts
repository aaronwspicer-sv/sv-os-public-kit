import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

// GET /api/security/audit?limit=50&action=pin_fail
// Returns recent audit log entries. Default 50, max 200.
export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 200);
  const action = req.nextUrl.searchParams.get("action");

  let q = supabase
    .from("audit_log")
    .select("id, action, metadata, created_at, user_id")
    // Include rows scoped to this user OR rows with no user_id (intrusion attempts)
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) q = q.eq("action", action);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  return NextResponse.json({ events: data ?? [] });
}
