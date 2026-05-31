"use client";
import { useEffect } from "react";

// Quietly registers the service worker on first mount.
// Renders nothing.
export function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW register failed:", err));
  }, []);
  return null;
}
