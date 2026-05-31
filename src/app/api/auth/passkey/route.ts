// List + delete registered passkeys (Settings panel).
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data } = await supabase
    .from("user_passkeys")
    .select("id, device_label, backed_up, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ passkeys: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("user_passkeys")
    .delete()
    .eq("user_id", user.id)
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  await supabase.from("audit_log").insert({
    user_id: user.id, action: "passkey_removed", metadata: { id },
  }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
