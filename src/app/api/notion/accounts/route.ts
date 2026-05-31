import { NextResponse } from "next/server";
import { requireFinanceAccess } from "@/lib/financeAuth";
import { notion, DB, queryDatabase } from "@/lib/notion";

export async function GET() {
  const gate = await requireFinanceAccess();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const results = await queryDatabase(
      DB.ACCOUNTS,
      { property: "Hide from Dashboard ✅", checkbox: { equals: false } },
    );

    const accounts = results.map((page: any) => {
      const props = page.properties ?? {};
      return {
        id: page.id,
        notionPageId: page.id,
        name: props["Name"]?.title?.[0]?.plain_text ?? "",
        type: props["Type"]?.select?.name ?? "Other",
        currency: props["Currency"]?.select?.name ?? "CAD",
        currentBalance: props["Current Balance (CAD)"]?.formula?.number ?? 0,
        projectedBalance: props["Projected Balance (CAD)"]?.formula?.number ?? 0,
        pendingDelta: props["Pending Delta (CAD)"]?.formula?.number ?? 0,
      };
    });

    return NextResponse.json({ accounts });
  } catch (error: any) {
    console.error("Notion accounts error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
