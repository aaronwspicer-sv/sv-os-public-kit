// Thin wrapper around Sentry so callers don't have to import @sentry/nextjs
// everywhere AND so the rest of the codebase can keep working if we ever
// swap Sentry for something else (custom Supabase log, Axiom, etc.).
//
// Usage:
//   import { captureError, captureWarn } from "@/lib/sentry";
//
//   try { … } catch (err) {
//     captureError(err, { route: "/api/notion/log", action: "save_log_entry" });
//     return NextResponse.json({ error: "Server error" }, { status: 500 });
//   }
import * as Sentry from "@sentry/nextjs";

export interface CaptureContext {
  /** Logical area — "alfred", "cron", "finance", "notion", "auth" */
  area?: string;
  /** Specific action that failed */
  action?: string;
  /** API route path if applicable */
  route?: string;
  /** User-scoped identifier (don't put PII here — use the Supabase user id) */
  userId?: string;
  /** Anything else useful for triage */
  extra?: Record<string, unknown>;
}

export function captureError(err: unknown, ctx: CaptureContext = {}): void {
  // Always log to console too — Vercel logs are the backup if Sentry is down
  // or DSN isn't configured.
  console.error(`[${ctx.area ?? "app"}/${ctx.action ?? "error"}]`, err, ctx);
  try {
    Sentry.withScope((scope) => {
      if (ctx.area)    scope.setTag("area", ctx.area);
      if (ctx.action)  scope.setTag("action", ctx.action);
      if (ctx.route)   scope.setTag("route", ctx.route);
      if (ctx.userId)  scope.setUser({ id: ctx.userId });
      if (ctx.extra)   scope.setContext("extra", ctx.extra as Record<string, unknown>);
      Sentry.captureException(err);
    });
  } catch {
    // Sentry init failure shouldn't crash the request — already logged above.
  }
}

export function captureWarn(message: string, ctx: CaptureContext = {}): void {
  console.warn(`[${ctx.area ?? "app"}/${ctx.action ?? "warn"}]`, message, ctx);
  try {
    Sentry.withScope((scope) => {
      if (ctx.area)   scope.setTag("area", ctx.area);
      if (ctx.action) scope.setTag("action", ctx.action);
      if (ctx.route)  scope.setTag("route", ctx.route);
      if (ctx.userId) scope.setUser({ id: ctx.userId });
      if (ctx.extra)  scope.setContext("extra", ctx.extra as Record<string, unknown>);
      Sentry.captureMessage(message, "warning");
    });
  } catch {}
}

/** Set the current user once on auth — Sentry tags every subsequent event with it. */
export function setSentryUser(userId: string | null): void {
  try {
    if (userId) Sentry.setUser({ id: userId });
    else Sentry.setUser(null);
  } catch {}
}
