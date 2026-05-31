import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// CSP is built per-request in middleware (nonce-based). Other security
// headers stay static here.
const staticSecurityHeaders = [
  { key: "X-DNS-Prefetch-Control",       value: "on" },
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options",              value: "DENY" },
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "Referrer-Policy",              value: "no-referrer" },
  { key: "Permissions-Policy",           value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig: NextConfig = {
  // Re-enabled — security regressions in TS shouldn't deploy silently
  typescript: { ignoreBuildErrors: false },
  // ESLint stays optional during builds (linter style nits shouldn't block)
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      { source: "/(.*)", headers: staticSecurityHeaders },
    ];
  },
  serverExternalPackages: ["@notionhq/client", "plaid", "bcryptjs", "otpauth", "qrcode", "web-push"],
};

// Sentry wraps the config to (a) upload source maps for readable stack
// traces in prod and (b) auto-instrument route handlers. If SENTRY_DSN
// isn't set the wrapper is a no-op at runtime, so local dev works without
// any Sentry creds. Source-map upload is also skipped without
// SENTRY_AUTH_TOKEN, so preview builds don't fail.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Don't upload source maps if no auth token — keeps preview builds quiet
  disableLogger: true,
  // Forward browser → server requests through /monitoring so ad blockers
  // don't suppress Sentry's ingest endpoint
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  reactComponentAnnotation: { enabled: false },
});
