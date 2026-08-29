import { describe, it, expect } from "vitest";
import { getJstDateString, parseDbTimestamp, getJstHour } from "../src/lib/time.js";

describe("getJstDateString", () => {
  it("returns the JST calendar date, which can differ from the UTC date", () => {
    // UTC 2026-08-29 15:02 = JST 2026-08-30 00:02 (日付をまたぐ)
    expect(getJstDateString(new Date("2026-08-29T15:02:34Z"))).toBe("2026-08-30");
    expect(getJstDateString(new Date("2026-08-29T01:00:00Z"))).toBe("2026-08-29");
  });
});

describe("parseDbTimestamp", () => {
  it("parses SQLite's CURRENT_TIMESTAMP format as UTC", () => {
    const parsed = parseDbTimestamp("2026-08-29 15:02:34");
    expect(parsed.toISOString()).toBe("2026-08-29T15:02:34.000Z");
    expect(getJstHour(parsed)).toBe(0); // JST 00:02
  });
});
