// GET /api/search?q=... — searches across todos, memories, bank txns
import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export interface SearchResult {
  id: string;
  kind: "todo" | "memory" | "transaction" | "asset";
  label: string;
  sub?: string;
  href?: string;
}

export async function GET(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const ilike = `%${q}%`;
  const results: SearchResult[] = [];

  const [todos, memories, txns, assets] = await Promise.all([
    supabase
      .from("daily_todos")
      .select("id, text, done, date")
      .eq("user_id", user.id)
      .ilike("text", ilike)
      .order("date", { ascending: false })
      .limit(5),
    supabase
      .from("alfred_memories")
      .select("id, content, kind, created_at")
      .eq("user_id", user.id)
      .ilike("content", ilike)
      .order("created_at", { ascending: false })
      .limit(4),
    supabase
      .from("bank_transactions")
      .select("id, merchant_name, amount, date, suggested_category")
      .eq("user_id", user.id)
      .ilike("merchant_name", ilike)
      .order("date", { ascending: false })
      .limit(4),
    supabase
      .from("manual_assets")
      .select("id, name, amount_cad, category")
      .eq("user_id", user.id)
      .ilike("name", ilike)
      .limit(4),
  ]);

  for (const t of todos.data ?? []) {
    results.push({
      id: `todo-${t.id}`,
      kind: "todo",
      label: t.text,
      sub: `${t.done ? "✓" : "○"} ${t.date}`,
      href: "/d/goals",
    });
  }
  for (const m of memories.data ?? []) {
    results.push({
      id: `mem-${m.id}`,
      kind: "memory",
      label: m.content.slice(0, 80),
      sub: `Memory · ${m.kind}`,
    });
  }
  for (const t of txns.data ?? []) {
    results.push({
      id: `tx-${t.id}`,
      kind: "transaction",
      label: t.merchant_name ?? "Unknown",
      sub: `$${Math.abs(t.amount).toFixed(2)} · ${t.date}`,
      href: "/d/finances",
    });
  }
  for (const a of assets.data ?? []) {
    results.push({
      id: `asset-${a.id}`,
      kind: "asset",
      label: a.name,
      sub: `$${Number(a.amount_cad).toLocaleString()} · ${a.category}`,
      href: "/d/finances",
    });
  }

  return NextResponse.json({ results: results.slice(0, 12) });
}
