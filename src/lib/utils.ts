import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { config } from "@/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  // YYYY-MM-DD strings need to be parsed as calendar dates (not UTC midnight),
  // otherwise toLocaleDateString in Toronto renders them as the previous day.
  let d: Date;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    d = new Date(`${date}T12:00:00Z`); // noon UTC → same day in any TZ
  } else {
    d = typeof date === "string" ? new Date(date) : date;
  }
  return d.toLocaleDateString("en-CA", {
    weekday: "short", month: "short", day: "numeric",
    timeZone: config.locale.timezone,
  });
}

// All "date" math is anchored to America/Toronto so it works correctly whether
// this runs in the browser (any local TZ) or on Vercel (UTC server).
const TZ = config.locale.timezone;

function torontoYMD(date: Date): string {
  // "en-CA" locale formats as YYYY-MM-DD
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

function torontoHour(date: Date): number {
  return parseInt(date.toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }), 10);
}

export function getActiveDateString(): string {
  const now = new Date();
  // Before 6am Toronto, we still consider yesterday the "active" day
  if (torontoHour(now) < 6) {
    return torontoYMD(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }
  return torontoYMD(now);
}

export function getTomorrowDateString(): string {
  const now = new Date();
  // Before 6am Toronto, "tomorrow" is actually today (since active=yesterday)
  if (torontoHour(now) < 6) {
    return torontoYMD(now);
  }
  return torontoYMD(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

export function formatCurrency(amount: number, currency: "CAD" | "USD" = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
