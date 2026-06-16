// Returns which AI brain Alfred is currently using.
// Used by the console UI to show the correct badge.
import { NextResponse } from "next/server";
import { USE_HERMES } from "@/lib/alfred/runChat";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    brain: USE_HERMES ? "hermes" : "gpt",
    label: USE_HERMES ? "HERMES" : "GPT-4.1",
    model: USE_HERMES
      ? (process.env.HERMES_BASE_URL ?? "hermes")
      : (process.env.OPENAI_ALFRED_MODEL ?? "gpt-4.1"),
  });
}
