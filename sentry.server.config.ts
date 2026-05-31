// Sentry — Node.js runtime (API routes, server actions, cron handlers).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment: process.env.VERCEL_ENV ?? "development",
    // Don't ship PII (no user emails, IPs in event payloads). The OS only has
    // one user but staying disciplined keeps the option open to ship later.
    sendDefaultPii: false,
  });
}
