import { NextResponse } from "next/server";
import { getJaysSummary } from "@/lib/jays";

// Public — no auth needed since the data itself is public
export async function GET() {
  try {
    const summary = await getJaysSummary();
    return NextResponse.json(summary, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
