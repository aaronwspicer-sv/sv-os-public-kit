// GET  /api/net-worth-history?months=12  — fetch snapshot history
// POST /api/net-worth-history             — record today's net worth snapshot
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const months = Math.max(1, Math.min(36, Number(req.nextUrl.searchParams.get("months") ?? 12)));
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select("snapshot_date, amount_cad, breakdown")
    .eq("user_id", user.id)
    .gte("snapshot_date", sinceStr)
    .order("snapshot_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => ({}));
  const amount = Number(body.amount_cad);
  if (!isFinite(amount)) return NextResponse.json({ error: "amount_cad required" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("net_worth_snapshots")
    .upsert(
      {
        user_id: user.id,
        snapshot_date: today,
        amount_cad: amount,
        breakdown: body.breakdown ?? {},
      },
      { onConflict: "user_id,snapshot_date" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, date: today, amount_cad: amount });
}
