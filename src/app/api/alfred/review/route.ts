// Manually trigger Alfred's coach review on demand.
// Returns the review text (no email, no push) so client can render inline.
// The Settings BriefingPreview adds a button for this; the chat /coach
// slash command can also trigger it via tool call.
import { NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { generateAlfredReview } from "@/lib/alfred/autonomous";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }
  const review = await generateAlfredReview(gate.user.id);
  if (!review) return NextResponse.json({ error: "Review generation failed" }, { status: 500 });
  return NextResponse.json({ ok: true, review });
}
