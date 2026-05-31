import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { notion, DB } from "@/lib/notion";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user, supabase } = gate;

  try {
    const response = await notion.dataSources.query({
      data_source_id: DB.GOALS,
      sorts: [{ property: "Priority Level", direction: "ascending" }],
    });

    const goals = response.results.map((page: any) => {
      const props = page.properties;
      // Current (CAD) is a rollup — handle both {number} and {array:[{number}]} shapes
      const rollup = props["Current (CAD)"]?.rollup;
      const current = typeof rollup?.number === "number"
        ? rollup.number
        : Array.isArray(rollup?.array)
          ? rollup.array.reduce((s: number, x: any) => s + (x?.number ?? 0), 0)
          : 0;
      return {
        id: page.id,
        title:    props["Goal"]?.title?.[0]?.plain_text ?? "Untitled",
        target:   props["Target (CAD)"]?.number ?? 0,
        current,
        status:   props["Status"]?.status?.name ?? "Not started",
        priority: props["Priority Level"]?.select?.name ?? "Medium",
        dueDate:  props["Due Date"]?.date?.start ?? null,
      };
    });

    return NextResponse.json({ goals });
  } catch (error: any) {
    console.error("Notion goals GET error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
