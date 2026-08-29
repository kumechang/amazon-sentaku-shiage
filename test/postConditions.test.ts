import { describe, it, expect } from "vitest";
import { getSeasonLabel, getJstMonth } from "../src/context/postConditions.js";

describe("getJstMonth", () => {
  it("returns the correct numeric month for a JST date (regression: ja-JP format() included '月' and broke Number())", () => {
    expect(getJstMonth(new Date("2026-08-29T01:00:00Z"))).toBe(8);
    expect(getJstMonth(new Date("2026-01-01T20:00:00Z"))).toBe(1); // UTC 20:00 = JST 翌日05:00(月は変わらない)
    expect(getJstMonth(new Date("2026-12-31T10:00:00Z"))).toBe(12);
  });
});

describe("getSeasonLabel", () => {
  it("maps each month to the correct season", () => {
    expect(getSeasonLabel(8)).toBe("夏(梅雨〜盛夏)");
    expect(getSeasonLabel(4)).toBe("春");
    expect(getSeasonLabel(10)).toBe("秋");
    expect(getSeasonLabel(1)).toBe("冬");
    expect(getSeasonLabel(12)).toBe("冬");
  });
});
