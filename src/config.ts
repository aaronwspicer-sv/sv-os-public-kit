// ─────────────────────────────────────────────────────────────
// Spicer OS — central configuration
// ─────────────────────────────────────────────────────────────
// SINGLE source of truth for everything that differs between the
// owner (Aaron) and anyone who self-hosts their own copy.
//
// This is a TYPED ACCESSOR over environment variables — NOT a file
// you hand-edit per deploy. The setup CLI (`npm run init`) writes
// .env.local for local dev; on Vercel you paste the same vars into
// the dashboard. Either way, nothing in code changes.
//
// Secrets (API keys, encryption keys) do NOT live here — they stay
// read directly from process.env at their point of use. This file is
// only the non-secret, owner-specific knobs.
//
// Anything read in CLIENT components must use a NEXT_PUBLIC_ var
// (Next inlines those into the browser bundle at build time). Server-
// only values can use a plain var.
// ─────────────────────────────────────────────────────────────

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function envNum(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // ── Public demo deploy ──────────────────────────────────────
  // When NEXT_PUBLIC_DEMO_MODE=true, this build is a throwaway PUBLIC demo:
  // login is bypassed, all data is faked (demo mode forced on), and Alfred
  // answers from canned scripts. NEVER set this on a real deploy — it serves
  // the OS shell without auth. Unset/false everywhere except demo.spicervisions.
  isPublicDemo: process.env.NEXT_PUBLIC_DEMO_MODE === "true",

  // ── Owner identity ──────────────────────────────────────────
  owner: {
    /** First name — greetings, Alfred persona, brief emails.
     *  Falls back to the legacy server-only OWNER_NAME for back-compat. */
    name: process.env.NEXT_PUBLIC_OWNER_NAME ?? process.env.OWNER_NAME ?? "you",
    /** Full name — formal contexts, email signatures. */
    fullName: process.env.NEXT_PUBLIC_OWNER_FULL_NAME ?? "Your Name",
    /** Where security/alert/brief emails are sent. Server-only. */
    alertEmail: process.env.OWNER_EMAIL ?? "owner@example.com",
  },

  // ── Brand ───────────────────────────────────────────────────
  brand: {
    /** Full product name — titles, headers, email subjects. */
    name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "My Life OS",
    /** Short name — tight UI spots, PWA short_name. */
    shortName: process.env.NEXT_PUBLIC_BRAND_SHORT_NAME ?? "My OS",
    /** One-line tagline (login screen, OG). */
    tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? "Personal Life System",
    /** Bare domain (no protocol) — emails, OG image URLs. */
    domain: process.env.NEXT_PUBLIC_APP_DOMAIN ?? "example.com",
    /** Full canonical URL with protocol — links in emails. Falls back to the
     *  configured domain so email/notification links never point at localhost
     *  (or someone else's domain) just because APP_URL wasn't set explicitly. */
    appUrl: process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.NEXT_PUBLIC_APP_DOMAIN
        ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}`
        : "http://localhost:3000"),
    /** From-address for transactional email. Server-only. */
    emailFrom: process.env.EMAIL_FROM ?? "My Life OS <onboarding@resend.dev>",
  },

  // ── Locale ──────────────────────────────────────────────────
  // FIRST-CLASS fields the setup wizard populates. Phase 2 routes
  // all ~70 hardcoded "America/Toronto" / "en-CA" / "CAD" literals
  // through these. Until then they're set but not yet consumed
  // everywhere — defaults keep Aaron's deploy behaving exactly as-is.
  locale: {
    /** IANA timezone — drives "today", streaks, cron rollover. */
    timezone: process.env.NEXT_PUBLIC_TIMEZONE ?? "America/Toronto",
    /** BCP-47 locale — date + number formatting. */
    locale: process.env.NEXT_PUBLIC_LOCALE ?? "en-CA",
    /** ISO 4217 currency code — money display. */
    currency: process.env.NEXT_PUBLIC_CURRENCY ?? "CAD",
    /** Home coords + label for the weather widget. */
    weather: {
      latitude: envNum(process.env.NEXT_PUBLIC_WEATHER_LAT, 43.6532),
      longitude: envNum(process.env.NEXT_PUBLIC_WEATHER_LON, -79.3832),
      label: process.env.NEXT_PUBLIC_WEATHER_LABEL ?? "Toronto",
    },
  },

  // ── Feature toggles ─────────────────────────────────────────
  // Default ON so Aaron's deploy is unchanged. Buyers flip OFF the
  // ones that are personal/regional. All NEXT_PUBLIC_ because the
  // dashboard (client) conditionally renders on them.
  features: {
    /** Blue Jays widget — very Toronto/personal. */
    jays: envBool(process.env.NEXT_PUBLIC_FEATURE_JAYS, true),
    /** Canadian tax-year ledger relation. */
    taxYear: envBool(process.env.NEXT_PUBLIC_FEATURE_TAX_YEAR, true),
    /** Workout Notion DB integration. */
    workout: envBool(process.env.NEXT_PUBLIC_FEATURE_WORKOUT, true),
    /** Finance vault + bank CSV import (high-sensitivity, opt-in). */
    financeVault: envBool(process.env.NEXT_PUBLIC_FEATURE_FINANCE_VAULT, true),
  },
} as const;

export type AppConfig = typeof config;
