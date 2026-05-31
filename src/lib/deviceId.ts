// Stable per-browser device identifier. HMAC-signed cookie so it can't be
// forged by a client. Used by the sessions tracker to correlate requests.
import { cookies } from "next/headers";

const COOKIE_NAME = "spicer_did";
const MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year

function getSecretBytes(): Uint8Array {
  const sec = process.env.TWO_FA_COOKIE_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!sec) throw new Error("TWO_FA_COOKIE_SECRET or ENCRYPTION_KEY required");
  if (/^[0-9a-fA-F]+$/.test(sec) && sec.length >= 32) {
    const bytes = new Uint8Array(sec.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(sec.substr(i * 2, 2), 16);
    return bytes;
  }
  return new TextEncoder().encode(sec);
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    getSecretBytes() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(id: string): Promise<string> {
  const key = await hmacKey();
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  return `${id}.${b64url(new Uint8Array(mac))}`;
}

async function verify(token: string): Promise<string | null> {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const id  = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const key = await hmacKey();
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  if (b64url(new Uint8Array(expected)) !== mac) return null;
  return id;
}

function newId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

/** Reads the device id from the cookie, or returns null if missing/invalid. */
export async function readDeviceId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return await verify(raw);
}

/** Reads, or creates + sets the cookie if missing. Returns the id. */
export async function ensureDeviceId(): Promise<string> {
  const existing = await readDeviceId();
  if (existing) return existing;
  const id = newId();
  const token = await sign(id);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true, secure: true, sameSite: "lax",
    path: "/", maxAge: MAX_AGE_SEC,
  });
  return id;
}
