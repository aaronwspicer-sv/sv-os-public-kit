import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { DB, queryDatabase } from "@/lib/notion";

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const startDate = sixtyDaysAgo.toISOString().split("T")[0];

    const results = await queryDatabase(
      DB.LEDGER,
      { property: "Date", date: { on_or_after: startDate } },
      [{ property: "Date", direction: "descending" }],
      100,
    );

    const entries = results.map((page: any) => {
      const props = page.properties ?? {};
      return {
        id: page.id,
        name: props["Name"]?.title?.[0]?.plain_text ?? "",
        amount: props["Amount"]?.number ?? 0,
        transactionType: props["Transaction Type"]?.select?.name ?? "",
        category: props["Category"]?.select?.name ?? "",
        status: props["Status"]?.select?.name ?? "",
        date: props["Date"]?.date?.start ?? "",
        fromAccountId: props["From Account"]?.relation?.[0]?.id ?? null,
        toAccountId: props["To Account"]?.relation?.[0]?.id ?? null,
        businessUsePct: props["Business Use %"]?.number ?? 0,
        currency: props["Currency"]?.select?.name ?? "CAD",
        notes: props["Notes"]?.rich_text?.[0]?.plain_text ?? "",
      };
    });

    return NextResponse.json({ entries });
  } catch (error: any) {
    console.error("Notion ledger error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
