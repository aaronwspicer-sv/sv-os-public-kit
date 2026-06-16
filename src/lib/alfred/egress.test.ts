import { describe, it, expect } from "vitest";
import { scanEgress, redactForEgress } from "./egress";

describe("egress wall — hard blocks", () => {
  it("blocks + redacts an API key", () => {
    const r = scanEgress("here is the key sk-ABCD1234EFGH5678IJKL to use");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("api-key");
    expect(r.redacted).not.toContain("sk-ABCD1234EFGH5678IJKL");
    expect(r.redacted).toContain("[redacted:api-key]");
  });

  it("blocks a JWT and a bearer token", () => {
    expect(scanEgress("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9").ok).toBe(false);
    expect(scanEgress("Authorization: Bearer abcdef0123456789ABCDEF").ok).toBe(false);
  });

  it("blocks a long account/card number", () => {
    const r = scanEgress("send to account 4111 1111 1111 1111 now");
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("account-or-card-number");
  });

  it("blocks a private key block", () => {
    expect(scanEgress("-----BEGIN PRIVATE KEY-----\nMIIE...").ok).toBe(false);
  });
});

describe("egress wall — sensitive terms", () => {
  it("redacts default finance terms but does not hard-block", () => {
    const r = scanEgress("my net worth is up and the account balance grew");
    expect(r.ok).toBe(true);
    expect(r.redacted).not.toMatch(/net worth/i);
    expect(r.redacted).not.toMatch(/account balance/i);
    expect(r.reasons.some(x => x.startsWith("sensitive-term:"))).toBe(true);
  });

  it("honors caller-supplied extra terms", () => {
    const r = scanEgress("project Falcon is secret", { extraTerms: ["Falcon"] });
    expect(r.redacted).not.toContain("Falcon");
  });
});

describe("egress wall — clean text passes untouched", () => {
  it("leaves ordinary content alone", () => {
    const text = "Drafted a video concept: I built an AI that runs my schedule.";
    const r = scanEgress(text);
    expect(r.ok).toBe(true);
    expect(r.redacted).toBe(text);
    expect(r.reasons).toHaveLength(0);
  });

  it("redactForEgress returns redacted text and never throws", () => {
    expect(redactForEgress("clean line")).toBe("clean line");
  });
});
