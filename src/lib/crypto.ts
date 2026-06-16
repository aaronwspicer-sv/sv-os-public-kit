// AES-256-GCM with key versioning so we can rotate ENCRYPTION_KEY without
// losing access to existing ciphertext. Stored format:
//   v{N}:iv:tag:ciphertext     (current — versioned, all hex)
//   iv:tag:ciphertext           (legacy — no version prefix, assumed key v1)
//
// To rotate:
//   1. Generate a new 32-byte hex key
//   2. Set ENCRYPTION_KEY_V2 in Vercel + bump ACTIVE_KEY_VERSION to "2"
//   3. Keep ENCRYPTION_KEY (old) set — needed to decrypt legacy/v1 rows
//   4. Run the optional re-encrypt script (rotateAll) to migrate rows to v2
//   5. Once all rows are v2, remove ENCRYPTION_KEY
import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function loadKey(version: string): Buffer | null {
  const envName = version === "1" ? "ENCRYPTION_KEY" : `ENCRYPTION_KEY_V${version}`;
  const hex = process.env[envName];
  if (!hex) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${envName} must be 64 hex chars (32 bytes)`);
  }
  return Buffer.from(hex, "hex");
}

// Cache keys to avoid re-parsing
const keyCache = new Map<string, Buffer>();
function getKey(version: string): Buffer {
  const cached = keyCache.get(version);
  if (cached) return cached;
  const k = loadKey(version);
  if (!k) throw new Error(`Encryption key v${version} not configured`);
  keyCache.set(version, k);
  return k;
}

// Which key version to use for NEW encryptions. Defaults to "1".
function activeVersion(): string {
  return process.env.ACTIVE_KEY_VERSION ?? "1";
}

export function encryptToken(plaintext: string): string {
  const version = activeVersion();
  const key = getKey(version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Versioned format: v{N}:iv:tag:ciphertext
  return `v${version}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  // Detect version: legacy "iv:tag:ct" (3 parts) vs versioned "vN:iv:tag:ct" (4 parts)
  const parts = stored.split(":");
  let version: string;
  let ivHex: string, tagHex: string, dataHex: string;
  if (parts.length === 4 && /^v\d+$/.test(parts[0])) {
    version = parts[0].slice(1);
    [, ivHex, tagHex, dataHex] = parts;
  } else if (parts.length === 3) {
    // Legacy — pre-versioning, assume v1
    version = "1";
    [ivHex, tagHex, dataHex] = parts;
  } else {
    throw new Error("Malformed ciphertext");
  }

  const key = getKey(version);
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  // Concatenate as Buffers first, then decode the WHOLE plaintext as UTF-8.
  // Doing `decipher.update(data) + decipher.final("utf8")` (the previous
  // form) silently mangles any multi-byte char whose UTF-8 bytes straddle
  // the boundary between the two pieces, because `update`'s Buffer is
  // coerced to a string with its own toString() before the concat. Our
  // current ciphertext is all-ASCII (Plaid tokens, base32 TOTP secrets),
  // so the bug was latent — fix it before it bites a future encrypted blob.
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Returns the version prefix used by a stored ciphertext. */
export function ciphertextVersion(stored: string): string {
  const m = stored.match(/^v(\d+):/);
  return m ? m[1] : "1";
}
