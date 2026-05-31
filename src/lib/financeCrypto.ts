// Separate AES-256-GCM encryption for finance secrets (Plaid access tokens).
// Uses FINANCE_ENCRYPTION_KEY, distinct from ENCRYPTION_KEY. If the main
// app's encryption key ever leaks, bank tokens stay safe.
//
// Storage format: f1:iv:tag:ciphertext (versioned for future rotation)
// Decrypt automatically also accepts legacy main-key formats (v1: prefix
// or unversioned) so existing rows keep working during migration.
import crypto from "crypto";
import { decryptToken as decryptWithMainKey } from "@/lib/crypto";

const ALGORITHM = "aes-256-gcm";

function getFinanceKey(version: string): Buffer {
  const envName = version === "1" ? "FINANCE_ENCRYPTION_KEY" : `FINANCE_ENCRYPTION_KEY_V${version}`;
  const hex = process.env[envName];
  if (!hex) throw new Error(`${envName} not configured`);
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${envName} must be 64 hex chars (32 bytes)`);
  return Buffer.from(hex, "hex");
}

function activeFinanceVersion(): string {
  return process.env.ACTIVE_FINANCE_KEY_VERSION ?? "1";
}

export function encryptFinanceToken(plaintext: string): string {
  const version = activeFinanceVersion();
  const key = getFinanceKey(version);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Prefix "f{version}" to distinguish from main-key encrypted blobs
  return `f${version}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptFinanceToken(stored: string): string {
  // New finance-key format: f{N}:iv:tag:ct
  const m = stored.match(/^f(\d+):/);
  if (m) {
    const parts = stored.split(":");
    const version = m[1];
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getFinanceKey(version);
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final("utf8");
  }

  // Legacy main-key format — accept during migration so we can re-encrypt
  // each row when it's accessed
  return decryptWithMainKey(stored);
}

/** True if the stored ciphertext uses the finance key (vs legacy main-key) */
export function isFinanceEncrypted(stored: string): boolean {
  return /^f\d+:/.test(stored);
}

/** Current active version, for re-encryption decisions */
export function activeFinanceCiphertextPrefix(): string {
  return `f${activeFinanceVersion()}`;
}
