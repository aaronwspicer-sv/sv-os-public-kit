import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { fireLoginAlert } from "@/lib/loginAlert";
import { checkRateLimit } from "@/lib/rateLimit";

// Internal — fired by the login page right after a successful email/password
// auth (Google login fires via /auth/callback). Requires a valid session
// (we just authenticated). Idempotent via the 24h same-context suppression
// in fireLoginAlert.
export async function POST(req: NextRequest) {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;
  const { user } = gate;

  // Rate limit notify-login to prevent spam if compromised session keeps calling it
  const rl = await checkRateLimit(`notify-login:${user.id}`, { limit: 5, window: 300 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
          ?? req.headers.get("x-real-ip") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "";

  fireLoginAlert({
    userId: user.id,
    email:  user.email ?? "",
    ip, userAgent,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
