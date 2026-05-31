import { describe, expect, it } from "vitest";
import { torontoMidnightUtcIso, torontoUtcOffsetMinutes, torontoDayOfWeek } from "./torontoDay";

describe("torontoMidnightUtcIso — DST-aware midnight", () => {
  it.each([
    // [label, description, expected UTC offset hours from midnight Toronto]
    ["2026-01-15", "EST winter",                            5],
    ["2026-03-07", "1 day before spring forward (still EST)", 5],
    ["2026-03-09", "1 day after spring forward (EDT)",      4],
    ["2026-05-25", "EDT summer",                            4],
    ["2026-10-31", "1 day before fall back (still EDT)",    4],
    ["2026-11-02", "1 day after fall back (EST)",           5],
    ["2026-12-25", "EST winter",                            5],
  ])("%s (%s) → midnight Toronto = T%i:00:00Z", (label, _desc, hours) => {
    const iso = torontoMidnightUtcIso(label);
    const expected = `${label}T${String(hours).padStart(2, "0")}:00:00.000Z`;
    expect(iso).toBe(expected);
  });
});

describe("torontoUtcOffsetMinutes", () => {
  it("returns -300 (EST) in January", () => {
    const at = new Date("2026-01-15T12:00:00Z");
    expect(torontoUtcOffsetMinutes(at)).toBe(-300);
  });
  it("returns -240 (EDT) in July", () => {
    const at = new Date("2026-07-15T12:00:00Z");
    expect(torontoUtcOffsetMinutes(at)).toBe(-240);
  });
});

describe("torontoDayOfWeek", () => {
  it("returns Saturday=6 for a known Saturday Toronto time", () => {
    // 2026-05-30 is a Saturday in Toronto
    const at = new Date("2026-05-30T18:00:00Z");
    expect(torontoDayOfWeek(at)).toBe(6);
  });
  it("returns Sunday=0", () => {
    const at = new Date("2026-05-31T18:00:00Z");
    expect(torontoDayOfWeek(at)).toBe(0);
  });
});
