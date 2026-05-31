// Edge-safe owner allowlist. Imported by:
//   - middleware.ts             (edge runtime — can't use next/headers)
//   - src/lib/auth.ts           (server)
//   - src/app/(protected)/layout.tsx (server)
//
// SINGLE source of truth. If you add an email, you only edit it here.
// Comparisons are case-insensitive — Supabase has occasionally returned
// mixed-case emails for OAuth providers, which previously caused legit
// users to bounce through the allowlist check in some files but not others.

const ALLOWED_EMAILS = new Set<string>([
  // ⚠️ REPLACE with YOUR login email(s) before deploying.
  "you@example.com",
]);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase());
}
