// Finance Vault — a separate security context layered on top of the OS.
// Unlocking requires PIN + TOTP. Stays open for 5 minutes per browser
// session via an HMAC-signed httpOnly cookie with its OWN secret (NOT
// shared with ENCRYPTION_KEY or TWO_FA_COOKIE_SECRET). If the main app
// is compromised, finances are still locked behind a separate factor.

import { cookies } from "next/headers";

const COOKIE_NAME = "spicer_finance_vault";
const MAX_AGE_SEC = 60 * 5; // 5 minutes

function getSecretBytes(): Uint8Array {
  const sec = process.env.FINANCE_VAULT_SECRET;
  if (!sec) throw new Error("FINANCE_VAULT_SECRET required for vault");
  if (/^[0-9a-fA-F]+$/.test(sec) && sec.length >= 32) {
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

function bytesToB64u(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uToBytes(s: string): Uint8Array {
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
  return `${payload}.${bytesToB64u(new Uint8Array(sig))}`;
}

async function verifyToken(token: string): Promise<{ userId: string; iat: number } | null> {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const macStr = token.slice(idx + 1);
  let mac: Uint8Array;
  try { mac = b64uToBytes(macStr); } catch { return null; }
  const key = await importHmacKey();
  const ok = await crypto.subtle.verify("HMAC", key, mac as BufferSource, new TextEncoder().encode(payload));
  if (!ok) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(b64uToBytes(payload)));
    if (typeof decoded?.userId !== "string" || typeof decoded?.iat !== "number") return null;
    if (Date.now() / 1000 - decoded.iat > MAX_AGE_SEC) return null;
    return decoded;
  } catch { return null; }
}

export async function unlockVault(userId: string): Promise<void> {
  const payloadObj = { userId, iat: Math.floor(Date.now() / 1000) };
  const payload = bytesToB64u(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const token = await sign(payload);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   true,
    sameSite: "strict",   // stricter than 2FA cookie — finance never via cross-site nav
    path:     "/",
    maxAge:   MAX_AGE_SEC,
  });
}

export async function lockVault(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isVaultUnlocked(userId: string): Promise<{ unlocked: boolean; expiresAt: number | null }> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return { unlocked: false, expiresAt: null };
  const decoded = await verifyToken(token);
  if (!decoded || decoded.userId !== userId) return { unlocked: false, expiresAt: null };
  return { unlocked: true, expiresAt: (decoded.iat + MAX_AGE_SEC) * 1000 };
}

export const FINANCE_VAULT_COOKIE_NAME = COOKIE_NAME;
export const FINANCE_VAULT_TTL_SEC = MAX_AGE_SEC;
