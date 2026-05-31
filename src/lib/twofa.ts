// 2FA session tracking — once a user passes TOTP verification on a device,
// we mark their session as "2FA-cleared" via a signed httpOnly cookie that
// expires when their Supabase session does (or 12h, whichever shorter).
//
// Uses Web Crypto API throughout so the verifier works in both middleware
// (edge runtime) and route handlers (node runtime).

import { cookies } from "next/headers";

const COOKIE_NAME  = "spicer_2fa";
const MAX_AGE_SEC  = 60 * 60 * 12; // 12 hours

function getSecretBytes(): Uint8Array {
  const sec = process.env.TWO_FA_COOKIE_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!sec) throw new Error("TWO_FA_COOKIE_SECRET or ENCRYPTION_KEY required");
  if (/^[0-9a-fA-F]+$/.test(sec) && sec.length >= 32) {
    // hex
    const bytes = new Uint8Array(sec.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(sec.substr(i * 2, 2), 16);
    return bytes;
  }
  return new TextEncoder().encode(sec);
}

async function importHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecretBytes() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sign(payload: string): Promise<string> {
  const key = await importHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

async function verifyToken(token: string): Promise<{ userId: string; iat: number } | null> {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const macStr  = token.slice(idx + 1);
  let macBytes: Uint8Array;
  try { macBytes = base64UrlToBytes(macStr); } catch { return null; }
  const key = await importHmacKey();
  const ok = await crypto.subtle.verify(
    "HMAC", key, macBytes as BufferSource, new TextEncoder().encode(payload),
  );
  if (!ok) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (typeof decoded?.userId !== "string" || typeof decoded?.iat !== "number") return null;
    if (Date.now() / 1000 - decoded.iat > MAX_AGE_SEC) return null;
    return decoded;
  } catch { return null; }
}

export async function markTwoFaCleared(userId: string): Promise<void> {
  const payloadObj = { userId, iat: Math.floor(Date.now() / 1000) };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const token = await sign(payload);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   true,
    sameSite: "lax",
    path:     "/",
    maxAge:   MAX_AGE_SEC,
  });
}

export async function clearTwoFa(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function hasValidTwoFa(userId: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const decoded = await verifyToken(token);
  return decoded !== null && decoded.userId === userId;
}

// Edge-runtime safe — pass the cookie value from request.cookies in middleware.
// All crypto is Web Crypto so this works in both edge and node.
export async function hasValidTwoFaFromCookie(cookieValue: string | undefined, userId: string): Promise<boolean> {
  if (!cookieValue) return false;
  const decoded = await verifyToken(cookieValue);
  return decoded !== null && decoded.userId === userId;
}

export const TWO_FA_COOKIE_NAME = COOKIE_NAME;
