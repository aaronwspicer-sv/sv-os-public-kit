import { describe, expect, it, beforeAll } from "vitest";

// crypto.ts reads ENCRYPTION_KEY from env. Stub a fixed key BEFORE importing
// so the module's keyCache picks it up.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64); // 32 zero bytes — fine for tests
});

describe("crypto encrypt/decrypt round-trip", () => {
  it("decrypts what it encrypts (ASCII)", async () => {
    const { encryptToken, decryptToken } = await import("./crypto");
    const plain = "access-sandbox-1234567890abcdef";
    const enc = encryptToken(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it("decrypts multi-byte UTF-8 plaintext without mangling the chunk boundary", async () => {
    // The previous buggy form `decipher.update(data) + decipher.final("utf8")`
    // mangled chars whose UTF-8 bytes straddled the buffer boundary. This
    // string has multi-byte chars deliberately positioned to test that.
    const { encryptToken, decryptToken } = await import("./crypto");
    const plain = "café résumé 日本語 → 🚀✨ Über naïve";
    const enc = encryptToken(plain);
    expect(decryptToken(enc)).toBe(plain);
  });

  it("produces a different ciphertext for each call (random IV)", async () => {
    const { encryptToken } = await import("./crypto");
    const a = encryptToken("same input");
    const b = encryptToken("same input");
    expect(a).not.toBe(b);
  });

  it("includes the version prefix in current output", async () => {
    const { encryptToken } = await import("./crypto");
    expect(encryptToken("x")).toMatch(/^v\d+:[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it("decrypts legacy (no-version-prefix) ciphertext", async () => {
    const { encryptToken, decryptToken } = await import("./crypto");
    // Strip the version prefix to simulate legacy-stored rows
    const versioned = encryptToken("legacy payload");
    const [, iv, tag, data] = versioned.split(":");
    const legacy = `${iv}:${tag}:${data}`;
    expect(decryptToken(legacy)).toBe("legacy payload");
  });
});
