// Speech → text via OpenAI Whisper. Accepts multipart audio blob from the
// chat UI's MediaRecorder. Returns the transcript so the client can fill
// the input + optionally auto-send.
import { NextRequest, NextResponse } from "next/server";
import { requireAlfred } from "@/lib/alfred/killSwitch";
import { checkRateLimit } from "@/lib/rateLimit";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const gate = await requireAlfred();
  if (!gate.ok) return gate.error;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`alfred-stt:${gate.user.id}:${ip}`, { limit: 30, window: 60 });
  if (!rl.ok) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

  const form = await req.formData();
  const blob = form.get("audio");
  if (!(blob instanceof Blob)) return NextResponse.json({ error: "No audio attached" }, { status: 400 });

  // Cap at ~25MB (Whisper's hard limit)
  if (blob.size > 24_000_000) return NextResponse.json({ error: "Audio too long (max ~25MB)" }, { status: 413 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  try {
    const file = await toFile(blob, "speech.webm");
    const r = await openai.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_WHISPER_MODEL ?? "whisper-1",
      response_format: "text",
      language: "en", // Aaron is English-only; speeds + improves accuracy
    });
    const text = typeof r === "string" ? r : (r as any).text ?? "";
    return NextResponse.json({ text });
  } catch (err: any) {
    console.error("transcribe failed:", err?.message);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
