"use client";
// Global React error boundary. Next.js auto-routes any unhandled render
// error to this component, AFTER which we forward it to Sentry. Without
// this file, render errors die silently in production.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{
        margin: 0,
        minHeight: "100vh",
        background: "#000",
        color: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: 400, padding: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#6b7280", marginBottom: 8 }}>
            Something broke
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>
            Unexpected error
          </h1>
          <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.55, margin: "0 0 20px" }}>
            The OS hit something it didn't know how to handle. The error has been
            logged. Try reloading.
          </p>
          {error.digest && (
            <p style={{ fontSize: 10, color: "#6b7280", fontFamily: "monospace", margin: "0 0 16px" }}>
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              background: "linear-gradient(180deg,#3eb0ff,#1d9bf0)",
              color: "#000",
              fontWeight: 700,
              fontSize: 13,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
