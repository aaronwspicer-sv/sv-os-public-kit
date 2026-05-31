import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase
    .from("wishlist")
    .select("*")
    .eq("user_id", user.id)
    .order("amount_cad", { ascending: false });

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { name, amount_cad } = await req.json();
  if (!name || amount_cad == null) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const { data, error } = await supabase
    .from("wishlist")
    .insert({ user_id: user.id, name, amount_cad })
    .select().single();

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { id } = await req.json();
  const { error } = await supabase
    .from("wishlist")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
