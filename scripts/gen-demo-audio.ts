#!/usr/bin/env -S npx tsx
// ─────────────────────────────────────────────────────────────
//  Generate Alfred's canned demo voice clips (OpenAI TTS).
//  Run ONCE with your key, then commit the mp3s so the public demo
//  can play them:
//      OPENAI_API_KEY=sk-... npm run gen-demo-audio
//      git add public/demo-alfred && git commit && git push
//  Files land in public/demo-alfred/<id>.mp3 (one per canned answer).
// ─────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { DEMO_QA, DEMO_FALLBACK } from "../src/lib/demoAlfred";

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("\n  ✗ Set OPENAI_API_KEY first:  OPENAI_API_KEY=sk-... npm run gen-demo-audio\n");
    process.exit(1);
  }

  const voice = process.env.DEMO_VOICE ?? "ash";        // Alfred's default voice
  const model = process.env.OPENAI_TTS_MODEL ?? "tts-1";
  const outDir = join(process.cwd(), "public", "demo-alfred");
  mkdirSync(outDir, { recursive: true });

  const openai = new OpenAI({ apiKey: key });
  const items = [...DEMO_QA, DEMO_FALLBACK];

  console.log(`\n  Generating ${items.length} demo clips (voice: ${voice})\n`);
  for (const q of items) {
    process.stdout.write(`  ${q.id.padEnd(10)} … `);
    const res = await openai.audio.speech.create({ model, voice: voice as any, input: q.answer });
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(outDir, `${q.id}.mp3`), buf);
    console.log(`✓ ${(buf.length / 1024).toFixed(0)} kB`);
  }
  console.log(`\n  ✓ Done → public/demo-alfred/  — commit these so the demo can play them.\n`);
})();
