import { describe, it, expect } from "vitest";
import { classifyTier, boundaryOf, isTaintedSource, assertNoMoneyMovement } from "./actions";
import { TOOLS, type ToolDef } from "./tools";
import { GREEN_AUTONOMOUS_TOOLS, isExecutableGreen } from "./agent/greenActions";

const stub = (over: Partial<ToolDef>): ToolDef => ({
  name: "x",
  description: "",
  parameters: {},
  execute: async () => ({}),
  ...over,
});

describe("money invariant", () => {
  it("the live tool registry holds no money-movement capability", () => {
    expect(() => assertNoMoneyMovement(TOOLS)).not.toThrow();
    expect(TOOLS.some(t => t.movesMoney === true)).toBe(false);
  });

  it("throws if any tool declares movesMoney", () => {
    expect(() => assertNoMoneyMovement([stub({ name: "wire", movesMoney: true })])).toThrow(
      /money-movement invariant/i,
    );
  });
});

describe("tier classification", () => {
  it("maps sensitivity to the right blast-radius tier", () => {
    expect(classifyTier(stub({ sensitivity: "write" }))).toBe("green");
    expect(classifyTier(stub({ sensitivity: "finance" }))).toBe("amber");
    expect(classifyTier(stub({ sensitivity: "destructive" }))).toBe("amber");
    // reads are observations, not ledgered actions
    expect(classifyTier(stub({ sensitivity: "safe" }))).toBeNull();
    expect(classifyTier(stub({ sensitivity: "external" }))).toBeNull();
  });

  it("outbound is always red", () => {
    expect(classifyTier(stub({ sensitivity: "write", boundary: "outbound" }))).toBe("red");
  });

  it("an explicit tier overrides the derived default", () => {
    expect(classifyTier(stub({ sensitivity: "write", tier: "amber" }))).toBe("amber");
  });

  it("external sources are tainted", () => {
    expect(isTaintedSource(stub({ sensitivity: "external" }))).toBe(true);
    expect(isTaintedSource(stub({ sensitivity: "write" }))).toBe(false);
  });
});

describe("the cage holds", () => {
  it("no red/outbound tool is ever in the green autonomous allow-list", () => {
    for (const t of TOOLS) {
      if (boundaryOf(t) === "outbound" || classifyTier(t) === "red") {
        expect(GREEN_AUTONOMOUS_TOOLS.has(t.name)).toBe(false);
        expect(isExecutableGreen(t.name)).toBe(false);
      }
    }
  });

  it("the green allow-list contains only green, internal, non-money tools", () => {
    for (const name of GREEN_AUTONOMOUS_TOOLS) {
      const t = TOOLS.find(x => x.name === name)!;
      expect(t).toBeTruthy();
      expect(classifyTier(t)).toBe("green");
      expect(boundaryOf(t)).toBe("internal");
      expect(t.movesMoney === true).toBe(false);
    }
  });
});
