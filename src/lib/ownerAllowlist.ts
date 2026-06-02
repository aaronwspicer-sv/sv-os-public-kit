// Edge-safe owner allowlist. Imported by:
//   - middleware.ts             (edge runtime — can't use next/headers)
//   - src/lib/auth.ts           (server)
//   - src/app/(protected)/layout.tsx (server)
//
// SINGLE source of truth. Set your login email(s) via env — no code edit:
//   OWNER_EMAIL=you@example.com
//   OWNER_EMAILS=you@example.com,you@work.com   (optional, comma-separated)
// The hardcoded FALLBACK_EMAILS below is only used when no env is set (and is
// emptied in the published kit, so buyers rely purely on their env var).
// Comparisons are case-insensitive — Supabase has occasionally returned
// mixed-case emails for OAuth providers.

const FALLBACK_EMAILS: string[] = []; // ← set OWNER_EMAIL in your env instead

const ENV_EMAILS = (process.env.OWNER_EMAILS ?? process.env.OWNER_EMAIL ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Union of env + fallback so an owner who sets OWNER_EMAIL never accidentally
// loses access to their other addresses. In the kit, FALLBACK_EMAILS is empty,
// so the allowlist is exactly what the buyer sets in their env.
const ALLOWED_EMAILS = new Set<string>([
  ...ENV_EMAILS,
  ...FALLBACK_EMAILS.map((e) => e.toLowerCase()),
]);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase());
}
