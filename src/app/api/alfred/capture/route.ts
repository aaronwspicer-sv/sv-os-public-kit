// Capture ingest — the cheap event-capture half of self-documenting. A git
// post-commit hook (or any local script) POSTs fresh build material here with a
// shared secret; it lands in alfred_capture_buffer for the evening self-doc pass
// to draft from. No agent wake, no LLM call — just a buffered write.
//
// Auth: Bearer ALFRED_CAPTURE_SECRET (for the unattended hook) OR an owner
// session (for manual/browser posts). Captured material is treated as DATA — it
// never instructs Alfred; the self-doc reader handles it behind the taint rule.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/auth";

export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const OWNER_USER_IDS_ENV = process.env.OWNER_USER_IDS?.split(",").map(s => s.trim()).filter(Boolean) ?? [];

async function resolveOwnerId(sb: ReturnType<typeof admin>): Promise<string | null> {
  if (OWNER_USER_IDS_ENV.length > 0) return OWNER_USER_IDS_ENV[0];
  try {
    const { data } = await sb.auth.admin.listUsers({ perPage: 1 });
    return data?.users?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const kind = body.kind === "commit" || body.kind === "video" || body.kind === "note" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "kind must be commit|video|note" }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.slice(0, 300) : null;
  const text  = typeof body.body === "string" ? body.body.slice(0, 8000) : null;
  const meta  = body.meta && typeof body.meta === "object" ? body.meta : null;

  // Auth path 1 — shared secret (the unattended hook).
  const secret = process.env.ALFRED_CAPTURE_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  let userId: string | null = null;
  let sb = admin();

  if (secret && bearer && bearer === secret) {
    userId = await resolveOwnerId(sb);
  } else {
    // Auth path 2 — owner session (manual capture).
    const gate = await requireOwner();
    if (!gate.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = gate.user.id;
    sb = admin(); // service role write (RLS-safe; we scope by userId)
  }

  if (!userId) return NextResponse.json({ error: "No owner resolved" }, { status: 500 });

  const { error } = await sb.from("alfred_capture_buffer").insert({
    user_id: userId, kind, title, body: text, meta,
  });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
