// Sentry — Edge runtime (middleware).
// Note: Edge runtime has limited Sentry features compared to Node — no native
// integrations, no profiling. Error capture works.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    environment: process.env.VERCEL_ENV ?? "development",
    sendDefaultPii: false,
  });
}
