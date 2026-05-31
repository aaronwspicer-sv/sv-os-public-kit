import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase
    .from("manual_assets")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { category, name, amount_cad } = await req.json();
  if (!category || !name || amount_cad == null) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data, error } = await supabase
    .from("manual_assets")
    .insert({ user_id: user.id, category, name, amount_cad })
    .select().single();

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ asset: data });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id, amount_cad, name } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updates: any = { updated_at: new Date().toISOString() };
  if (amount_cad != null) updates.amount_cad = amount_cad;
  if (name)               updates.name = name;

  const { error } = await supabase
    .from("manual_assets")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await req.json();
  const { error } = await supabase
    .from("manual_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
