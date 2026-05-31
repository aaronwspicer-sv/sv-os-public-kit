// WebAuthn / Passkey config + helpers.
// Works on Touch ID (Mac), Face ID (iPhone via Safari), Windows Hello,
// Chrome OS unlock, and hardware security keys. Phone-as-roaming-authenticator
// (hybrid transport) works for the school Chromebook even if its policy
// blocks platform authenticators — user just scans a QR with their phone.
//
// Production:  origin = https://www.spicervisions.online, rpID = "spicervisions.online"
// Local dev:   origin = http://localhost:3000,            rpID = "localhost"
//
// We accept BOTH www and apex origins so a passkey registered at one works
// at the other. RP_ID is the base domain so it spans both.

import { config } from "@/config";

export const RP_NAME = config.brand.name;

// Multi-origin support for prod (www + apex) + local dev. Derived from the
// owner's configured domain so passkeys work on ANY deploy, not just
// spicervisions.online.
const DOMAIN = config.brand.domain;
export const EXPECTED_ORIGINS = [
  config.brand.appUrl,
  `https://${DOMAIN}`,
  `https://www.${DOMAIN}`,
  "http://localhost:3000",
  "http://localhost:3001",
];

export const RP_ID_PROD = DOMAIN;
export const RP_ID_DEV  = "localhost";

export function resolveRpID(origin: string | null | undefined): string {
  if (!origin) return RP_ID_PROD;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host.endsWith(".localhost")) return RP_ID_DEV;
    if (host === RP_ID_PROD || host.endsWith(`.${RP_ID_PROD}`)) return RP_ID_PROD;
  } catch {}
  return RP_ID_PROD;
}

/** Derive a human label from a UA string ("Mac · Safari", "iPhone · Safari", "Chromebook · Chrome"). */
export function labelFromUA(ua: string | null | undefined): string {
  const u = (ua ?? "").toLowerCase();
  let device = "Device";
  if (u.includes("iphone"))        device = "iPhone";
  else if (u.includes("ipad"))     device = "iPad";
  else if (u.includes("cros"))     device = "Chromebook";
  else if (u.includes("android"))  device = "Android";
  else if (u.includes("mac os") || u.includes("macintosh")) device = "Mac";
  else if (u.includes("windows"))  device = "Windows";
  else if (u.includes("linux"))    device = "Linux";

  let browser = "";
  if (u.includes("edg/"))                                 browser = "Edge";
  else if (u.includes("chrome") && !u.includes("edg/"))   browser = "Chrome";
  else if (u.includes("firefox"))                         browser = "Firefox";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";

  return browser ? `${device} · ${browser}` : device;
}
