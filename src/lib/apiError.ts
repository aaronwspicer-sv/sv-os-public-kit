// Standardized error responses for API routes — never leak raw error.message
// to the client. Internal details go to server logs; client gets a generic
// safe message + the HTTP status.

import { NextResponse } from "next/server";

const SAFE_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  422: "Invalid input",
  429: "Too many requests",
  500: "Server error",
  503: "Service unavailable",
};

/**
 * Generic safe error response. Logs the underlying error server-side with
 * an optional tag for tracing.
 */
export function apiError(status: number, internalError?: any, tag?: string): NextResponse {
  if (internalError) {
    console.error(`[${tag ?? "api"}] ${status}:`, internalError?.message ?? internalError);
  }
  return NextResponse.json(
    { error: SAFE_MESSAGES[status] ?? "Error" },
    { status },
  );
}

/**
 * For validation errors where it IS safe to surface the message
 * (e.g. "PIN must be at least 4 digits") — caller controls the string.
 */
export function apiValidationError(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
