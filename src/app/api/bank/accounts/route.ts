import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";

// Account/item state changes fast (CSV import, balance edits) — never
// serve a cached snapshot. Without this, Next 15 caches the GET and the
// finances page can stay on the onboarding screen forever after an upload.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase.from("bank_items")
      .select("id, institution, status, error_code, last_refresh_at, next_refresh_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("bank_accounts")
      .select("id, item_id, name, institution, type, category, currency, balance, available_balance, mask, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);

  // Roll up totals + linked flag for finances page compat
  const totalCad = (accounts ?? []).reduce((s, a) => {
    const sign = (a.category === "credit_card" || a.category === "loan") ? -1 : 1;
    return s + sign * Number(a.balance ?? 0);
  }, 0);

  return NextResponse.json({
    items: items ?? [],
    accounts: accounts ?? [],
    hasItems: (items?.length ?? 0) > 0,
    totalCad: Math.round(totalCad * 100) / 100,
  });
}

// Rename / re-categorize an account. Body: { id, name?, category? }
export async function PATCH(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const update: any = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string") update.name = body.name.trim().slice(0, 60);
  if (typeof body?.category === "string" && ["checking","savings","credit_card","loan","investment","insurance"].includes(body.category)) {
    update.category = body.category;
  }
  if (Object.keys(update).length === 1) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await supabase.from("bank_accounts")
    .update(update).eq("user_id", user.id).eq("id", id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "bank_account_renamed", metadata: { id, ...update },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const itemId = req.nextUrl.searchParams.get("item_id");
  if (!itemId) return NextResponse.json({ error: "Missing item_id" }, { status: 400 });

  // CSV-imported items are self-hosted — no upstream provider to also delete.
  const { error } = await supabase.from("bank_items")
    .delete().eq("user_id", user.id).eq("id", itemId);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "bank_item_deleted", metadata: { item_id: itemId },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
