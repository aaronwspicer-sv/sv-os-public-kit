import { describe, expect, it } from "vitest";
import { defaultSplitsForType, validateTransactionRelations } from "./confirmTransaction";

describe("defaultSplitsForType", () => {
  it("Expense → 100% spend", () => {
    expect(defaultSplitsForType("Expense")).toEqual({ save: 0, spend: 1.0, tax: 0 });
  });
  it("Tax Payment → 100% tax", () => {
    expect(defaultSplitsForType("Tax Payment")).toEqual({ save: 0, spend: 0, tax: 1.0 });
  });
  it("Income → 20% save / 30% tax / 50% implicit spend bucket", () => {
    expect(defaultSplitsForType("Income")).toEqual({ save: 0.20, spend: 0, tax: 0.30 });
  });
  it("Transfer → zero splits (the move is between accounts, not budget)", () => {
    expect(defaultSplitsForType("Transfer")).toEqual({ save: 0, spend: 0, tax: 0 });
  });
});

describe("validateTransactionRelations — Transfer guard", () => {
  it("allows Transfer with BOTH From and To set", () => {
    expect(validateTransactionRelations("Transfer", "page-from", "page-to")).toBeNull();
  });
  it("rejects Transfer with only From set", () => {
    expect(validateTransactionRelations("Transfer", "page-from", null)).toContain("Transfers require both");
  });
  it("rejects Transfer with only To set", () => {
    expect(validateTransactionRelations("Transfer", null, "page-to")).toContain("Transfers require both");
  });
  it("rejects Transfer with neither set", () => {
    expect(validateTransactionRelations("Transfer", null, null)).toContain("Transfers require both");
  });
  it("rejects Transfer with empty-string accounts (truthiness check)", () => {
    expect(validateTransactionRelations("Transfer", "", "page-to")).toContain("Transfers require both");
  });

  it("allows Expense without To Account", () => {
    expect(validateTransactionRelations("Expense", "page-from", null)).toBeNull();
  });
  it("allows Income without From Account", () => {
    expect(validateTransactionRelations("Income", null, "page-to")).toBeNull();
  });
  it("allows Tax Payment with just From", () => {
    expect(validateTransactionRelations("Tax Payment", "page-from", null)).toBeNull();
  });
});
