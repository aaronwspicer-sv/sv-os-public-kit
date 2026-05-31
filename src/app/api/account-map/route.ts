import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";

// Maps a Plaid account ID to a Notion Accounts DB page ID for the current user.
// Used by the transaction confirm flow to auto-default the "From Account" relation.

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { data, error } = await supabase
    .from("plaid_notion_account_map")
    .select("plaid_account_id, notion_page_id")
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const mappings = (data ?? []).map(r => ({
    plaidAccountId: r.plaid_account_id,
    notionPageId:   r.notion_page_id,
  }));
  return NextResponse.json({ mappings });
}

export async function POST(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { plaidAccountId, notionPageId } = await req.json();
  if (!plaidAccountId || !notionPageId) {
    return NextResponse.json({ error: "Missing plaidAccountId or notionPageId" }, { status: 400 });
  }

  const { error } = await supabase
    .from("plaid_notion_account_map")
    .upsert(
      { user_id: user.id, plaid_account_id: plaidAccountId, notion_page_id: notionPageId },
      { onConflict: "user_id,plaid_account_id" },
    );

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const { plaidAccountId } = await req.json();
  if (!plaidAccountId) return NextResponse.json({ error: "Missing plaidAccountId" }, { status: 400 });

  const { error } = await supabase
    .from("plaid_notion_account_map")
    .delete()
    .eq("user_id", user.id)
    .eq("plaid_account_id", plaidAccountId);

  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
