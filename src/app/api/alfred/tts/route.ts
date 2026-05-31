// Text → speech via OpenAI TTS. Returns the audio bytes (mp3) so the
// client just sets it as src on an <audio> element and plays.
import { NextRequest, NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { checkRateLimit } from "@/lib/rateLimit";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Allow-list voices that exist in OpenAI's TTS catalogue
const VOICES = new Set([
  "alloy","ash","ballad","coral","echo","fable","nova","onyx","sage","shimmer","verse",
]);

export async function POST(req: NextRequest) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`alfred-tts:${gate.user.id}:${ip}`, { limit: 60, window: 60 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const text  = typeof body?.text === "string" ? body.text.trim() : "";
  const voice = (typeof body?.voice === "string" && VOICES.has(body.voice)) ? body.voice : "nova";
  const speed = typeof body?.speed === "number" ? Math.max(0.25, Math.min(4, body.speed)) : 1.05;
  if (!text) return NextResponse.json({ error: "Empty text" }, { status: 400 });
  // Cap text to avoid runaway costs
  const trimmed = text.slice(0, 4000);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const r = await openai.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL ?? "tts-1",
      voice: voice as any,
      input: trimmed,
      speed,
      response_format: "mp3",
    });
    const buf = Buffer.from(await r.arrayBuffer());
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type":  "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("tts failed:", err?.message);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}
